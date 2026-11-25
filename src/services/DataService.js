/**
 * DataService.js
 * Централизованное управление данными (полный паритет с Android WordRepositoryImpl / FirebaseDataSource)
 * Приоритет источников: Memory Cache → LocalStorage → Firebase (Golden DB) → DeepSeek AI → BaseDict
 */

import { ref, set, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase';
import { BaseDict } from '../utils/BaseDict';
import { normalizeWord, hasCyrillic, isValidFirebaseKey, isValidMatch } from '../utils/wordMatcher';
import { scheduleSrs } from '../utils/srsScheduler';

const CACHE_KEY = 'flashcards_seznam_cache';
const KNOWN_WORDS_KEY = 'flashcards_seznam_known_words';
const PHRASE_BUCKET_COUNT = 100;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 700;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseStringField(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string').join(', ');
  return '';
}

function parseStringList(value) {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function parseExamples(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object' && (item.czech || item.russian))
    .map(item => ({
      czech: typeof item.czech === 'string' ? item.czech : '',
      russian: typeof item.russian === 'string' ? item.russian : '',
      ...(typeof item.ukrainian === 'string' ? { ukrainian: item.ukrainian } : {})
    }));
}

function hasTranslations(entry) {
  if (!entry) return false;
  const ru = parseStringList(entry.translations);
  const ua = parseStringList(entry.translations_ua || entry.translationsUa);
  return ru.length > 0 || ua.length > 0;
}

function phraseBucket(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return ((hash % PHRASE_BUCKET_COUNT) + PHRASE_BUCKET_COUNT) % PHRASE_BUCKET_COUNT;
}

function normalizeEntry(raw, fallbackWord = '') {
  if (!raw || typeof raw !== 'object') return null;
  const word = String(raw.word_normalized || raw.word || fallbackWord).trim();
  const normalizedKey = normalizeWord(word || fallbackWord);

  return {
    word: word || normalizedKey,
    word_normalized: normalizedKey,
    translations: parseStringList(raw.translations),
    translations_ua: parseStringList(raw.translations_ua || raw.translationsUa),
    gender: typeof raw.gender === 'string' ? raw.gender : '',
    grammar: typeof raw.grammar === 'string' ? raw.grammar : (typeof raw.pos === 'string' ? raw.pos : ''),
    forms: parseStringList(raw.forms),
    examples: parseExamples(raw.examples),
    ipa: parseStringField(raw.ipa),
    vzor: parseStringField(raw.vzor),
    vazba: parseStringField(raw.vazba),
    stress: parseStringField(raw.stress),
    style: parseStringField(raw.style),
    cefr_level: String(raw.cefr_level || raw.cefrLevel || ''),
    is_corrected: Boolean(raw.is_corrected ?? raw.isCorrected ?? false),
    aspect_pair: String(raw.aspect_pair || raw.aspectPair || ''),
    frequency_rank: Number(raw.frequency_rank ?? raw.frequencyRank ?? 0) || 0,
    part_of_speech: String(raw.part_of_speech || raw.partOfSpeech || raw.pos || raw.grammar || ''),
    isEnriched: Boolean(raw.isEnriched ?? raw.is_enriched ?? false),
    isKnown: Boolean(raw.isKnown ?? raw.is_known ?? false),
    nextReviewAt: Number(raw.nextReviewAt ?? 0) || 0,
    intervalDays: Number(raw.intervalDays ?? 0) || 0,
    easeFactor: Number(raw.easeFactor ?? 2.5) || 2.5,
    repetitions: Number(raw.repetitions ?? 0) || 0,
    learned_at: Number(raw.learned_at ?? raw.learnedAt ?? 0) || 0,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : '',
    source: typeof raw.source === 'string' ? raw.source : 'firebase'
  };
}

class DataService {
  constructor() {
    this.baseDict = new BaseDict();
    this.translationCache = new Map();
    this.stats = {
      cacheHits: 0,
      firebaseHits: 0,
      deepseekHits: 0,
      fallbackHits: 0,
      totalRequests: 0
    };
  }

  normalizeUnicode(str) {
    return normalizeWord(str);
  }

  // =========================================================================
  // LOCAL STORAGE (CACHE + KNOWN WORDS + HISTORY)
  // =========================================================================

  _readLocalCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch (error) {
      console.error('Error reading localStorage cache:', error);
      return {};
    }
  }

  _writeLocalCache(cache) {
    try {
      const now = Date.now();
      const entries = Object.entries(cache)
        .filter(([_, entry]) => {
          if (!entry) return false;
          const cachedTime = entry.cachedAt ? new Date(entry.cachedAt).getTime() : now;
          const diffDays = (now - cachedTime) / (1000 * 60 * 60 * 24);
          return Number.isNaN(diffDays) || diffDays < 90;
        })
        .sort((a, b) => {
          const tA = a[1].learned_at || new Date(a[1].cachedAt || 0).getTime() || 0;
          const tB = b[1].learned_at || new Date(b[1].cachedAt || 0).getTime() || 0;
          return tB - tA;
        })
        .slice(0, 1000);

      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
      return true;
    } catch (error) {
      console.error('Error writing localStorage cache:', error);
      return false;
    }
  }

  getKnownWordsSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(KNOWN_WORDS_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(normalizeWord) : []);
    } catch {
      return new Set();
    }
  }

  _saveKnownWordsSet(setObj) {
    try {
      localStorage.setItem(KNOWN_WORDS_KEY, JSON.stringify(Array.from(setObj)));
    } catch (error) {
      console.error('Error saving known words:', error);
    }
  }

  isWordKnown(word) {
    return this.getKnownWordsSet().has(normalizeWord(word));
  }

  markAsKnown(entry) {
    if (!entry) return;
    const key = normalizeWord(entry.word_normalized || entry.word);
    if (!key) return;

    const known = this.getKnownWordsSet();
    known.add(key);
    this._saveKnownWordsSet(known);

    const updated = { ...normalizeEntry(entry, key), isKnown: true };
    this.saveToLocalStorage(key, updated, { preserveLocalState: true });
    this.translationCache.set(key, updated);
  }

  markAsUnknown(word) {
    const key = normalizeWord(word);
    if (!key) return;

    const known = this.getKnownWordsSet();
    known.delete(key);
    this._saveKnownWordsSet(known);

    const cache = this._readLocalCache();
    if (cache[key]) {
      cache[key] = {
        ...cache[key],
        isKnown: false,
        nextReviewAt: 0,
        intervalDays: 0,
        repetitions: 0
      };
      this._writeLocalCache(cache);
      this.translationCache.set(key, normalizeEntry(cache[key], key));
    }
  }

  reviewWord(entry, rating) {
    if (!entry) return null;
    const key = normalizeWord(entry.word_normalized || entry.word);
    if (!key) return null;

    const schedule = scheduleSrs(
      rating,
      entry.intervalDays,
      entry.easeFactor,
      entry.repetitions
    );
    const updated = {
      ...normalizeEntry(entry, key),
      ...schedule
    };
    this.saveToLocalStorage(key, updated, { preserveLocalState: false });
    return updated;
  }

  getDueWordsCount(now = Date.now()) {
    return this.getAllCachedWords().filter(
      w => !w.isKnown && (!w.nextReviewAt || w.nextReviewAt <= now)
    ).length;
  }

  /**
   * Умная SRS-выборка (1:1 с Android WordDao.getWordsForSrsLearning):
   * 1) просроченные SRS-повторения (самые старые первыми)
   * 2) новые неизученные: глаголы → прилагательные → по frequency_rank
   */
  getWordsForSrsLearning(limit = 15, now = Date.now()) {
    const due = this.getAllCachedWords().filter(
      w => !w.isKnown && (!w.nextReviewAt || w.nextReviewAt <= now)
    );

    const posPriority = (w) => {
      const g = `${w.grammar || ''} ${w.part_of_speech || ''}`.toLowerCase();
      if (g.includes('verb') || g.includes('глагол')) return 1;
      if (g.includes('adj') || g.includes('прил')) return 2;
      return 3;
    };

    due.sort((a, b) => {
      const aDue = a.nextReviewAt > 0 && a.nextReviewAt <= now ? 0 : 1;
      const bDue = b.nextReviewAt > 0 && b.nextReviewAt <= now ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      if (aDue === 0 && a.nextReviewAt !== b.nextReviewAt) {
        return a.nextReviewAt - b.nextReviewAt;
      }
      const posDiff = posPriority(a) - posPriority(b);
      if (posDiff !== 0) return posDiff;
      const rankA = a.frequency_rank > 0 ? a.frequency_rank : 999999;
      const rankB = b.frequency_rank > 0 ? b.frequency_rank : 999999;
      return rankA - rankB;
    });

    return due.slice(0, limit);
  }

  getFromLocalStorage(word) {
    const cache = this._readLocalCache();
    const key = normalizeWord(word);
    const raw = cache[key];
    if (!raw) return null;
    const entry = normalizeEntry(raw, key);
    if (!entry) return null;
    entry.isKnown = entry.isKnown || this.isWordKnown(key);
    return entry;
  }

  saveToLocalStorage(word, data, { preserveLocalState = true } = {}) {
    if (!data) return false;
    const key = normalizeWord(word || data.word_normalized || data.word);
    if (!key) return false;

    const cache = this._readLocalCache();
    const existing = cache[key];
    const knownSet = this.getKnownWordsSet();
    const normalized = normalizeEntry(data, key);

    const merged = {
      ...normalized,
      word: normalized.word || key,
      word_normalized: key,
      isKnown: preserveLocalState
        ? Boolean(normalized.isKnown || existing?.isKnown || knownSet.has(key))
        : Boolean(normalized.isKnown),
      isEnriched: preserveLocalState
        ? Boolean(normalized.isEnriched || existing?.isEnriched)
        : Boolean(normalized.isEnriched),
      nextReviewAt: preserveLocalState
        ? (normalized.nextReviewAt > 0 ? normalized.nextReviewAt : (existing?.nextReviewAt || 0))
        : normalized.nextReviewAt,
      intervalDays: preserveLocalState
        ? (normalized.intervalDays > 0 ? normalized.intervalDays : (existing?.intervalDays || 0))
        : normalized.intervalDays,
      easeFactor: preserveLocalState && existing?.easeFactor && normalized.repetitions === 0 && normalized.nextReviewAt === 0
        ? existing.easeFactor
        : normalized.easeFactor,
      repetitions: preserveLocalState
        ? (normalized.repetitions > 0 ? normalized.repetitions : (existing?.repetitions || 0))
        : normalized.repetitions,
      learned_at: normalized.learned_at > 0
        ? normalized.learned_at
        : (existing?.learned_at > 0 ? existing.learned_at : Date.now()),
      cachedAt: new Date().toISOString()
    };

    cache[key] = merged;
    this.translationCache.set(key, merged);
    return this._writeLocalCache(cache);
  }

  getAllCachedWords() {
    const cache = this._readLocalCache();
    const knownSet = this.getKnownWordsSet();
    return Object.entries(cache)
      .map(([key, raw]) => {
        const entry = normalizeEntry(raw, key);
        if (!entry || !hasTranslations(entry)) return null;
        if (!entry.learned_at) {
          entry.learned_at = raw.cachedAt ? new Date(raw.cachedAt).getTime() : 0;
        }
        entry.isKnown = entry.isKnown || knownSet.has(normalizeWord(entry.word));
        return entry;
      })
      .filter(Boolean)
      .sort((a, b) => (b.learned_at || 0) - (a.learned_at || 0));
  }

  /**
   * Группировка истории по 15-минутным сессиям (как в Android MainViewModel.loadHistory)
   */
  getHistorySessions(lang = 'ru') {
    const words = this.getAllCachedWords();
    if (words.length === 0) return [];

    const threshold = 15 * 60 * 1000;
    const locale = lang === 'ua' || lang === 'uk' ? 'uk-UA' : 'ru-RU';
    const formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    const sessions = [];
    let currentBatch = [words[0]];

    for (let i = 1; i < words.length; i += 1) {
      const prev = words[i - 1];
      const curr = words[i];
      if (Math.abs((prev.learned_at || 0) - (curr.learned_at || 0)) > threshold) {
        const sessionDate = currentBatch[0].learned_at || Date.now();
        sessions.push({
          id: `${sessionDate}-${sessions.length}`,
          date: sessionDate,
          label: formatter.format(new Date(sessionDate)),
          words: currentBatch
        });
        currentBatch = [];
      }
      currentBatch.push(curr);
    }

    if (currentBatch.length > 0) {
      const sessionDate = currentBatch[0].learned_at || Date.now();
      sessions.push({
        id: `${sessionDate}-${sessions.length}`,
        date: sessionDate,
        label: formatter.format(new Date(sessionDate)),
        words: currentBatch
      });
    }

    return sessions;
  }

  // =========================================================================
  // DEEPSEEK API (С РЕТРАЯМИ И РЕЖИМОМ ФРАЗ)
  // =========================================================================

  async translateWithDeepSeek(word, forcedMode = null) {
    const trimmed = String(word || '').trim();
    if (!trimmed) return null;
    const mode = forcedMode || (/\s+/.test(trimmed) ? 'phrase' : 'word');

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch('/.netlify/functions/translate-deepseek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, mode })
        });

        const isTransientStatus =
          response.status === 408 || response.status === 429 || (response.status >= 500 && response.status <= 599);

        if (!response.ok) {
          const err = new Error(`DeepSeek HTTP ${response.status}`);
          err.isTransient = isTransientStatus;
          throw err;
        }

        const data = await response.json();
        if (data.error) {
          console.error('[DeepSeek] API error:', data.error);
          return null;
        }

        const entry = normalizeEntry({ ...data, source: 'deepseek' }, trimmed);
        return entry ? { ...entry, success: true } : null;
      } catch (error) {
        lastError = error;
        const isTransient = error?.isTransient !== undefined
          ? error.isTransient
          : error instanceof TypeError || /network|fetch|timeout|abort/i.test(error?.message || '');

        if (!isTransient || attempt === MAX_RETRY_ATTEMPTS) {
          console.error('[DeepSeek] Error:', error);
          return null;
        }

        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }

    if (lastError) console.error('[DeepSeek] Final error:', lastError);
    return null;
  }

  // =========================================================================
  // FIREBASE RTDB (ПОИСК, СОХРАНЕНИЕ, ФРАЗЫ, ВАЛИДАЦИЯ)
  // =========================================================================

  _isValidFormIndexMatch(form, entry) {
    const normalizedForm = normalizeWord(form);
    if (normalizeWord(entry.word) === normalizedForm) return true;
    return (entry.forms || []).some(candidate => normalizeWord(candidate) === normalizedForm);
  }

  _preservePhraseKeyIfNeeded(requestedKey, entry) {
    const normalizedKey = normalizeWord(requestedKey);
    const normalizedEntryWord = normalizeWord(entry.word);
    if (normalizedKey.includes(' ') && !normalizedEntryWord.includes(' ')) {
      return { ...entry, word: normalizedKey, word_normalized: normalizedKey };
    }
    return entry;
  }

  async getFromFirebase(word) {
    if (!database) return null;
    const normalizedKey = normalizeWord(word);
    if (!isValidFirebaseKey(normalizedKey)) return null;

    try {
      // Приоритет путей как в Android: dictionary/ → words/ → корень
      const pathsToTry = [
        `dictionary/${normalizedKey}`,
        `words/${normalizedKey}`,
        normalizedKey
      ];

      for (const path of pathsToTry) {
        try {
          const snapshot = await get(ref(database, path));
          if (snapshot.exists()) {
            const entry = normalizeEntry(snapshot.val(), normalizedKey);
            if (entry && hasTranslations(entry)) {
              return this._preservePhraseKeyIfNeeded(normalizedKey, entry);
            }
          }
        } catch (err) {
          console.warn(`[Firebase] Path read failed (${path}):`, err.message);
        }
      }

      // Поиск базового слова через forms_index
      try {
        const indexSnapshot = await get(ref(database, `forms_index/${normalizedKey}`));
        if (indexSnapshot.exists()) {
          const baseWordKey = normalizeWord(indexSnapshot.val());
          if (isValidFirebaseKey(baseWordKey)) {
            const basePaths = [
              `dictionary/${baseWordKey}`,
              `words/${baseWordKey}`,
              baseWordKey
            ];
            for (const basePath of basePaths) {
              const baseSnapshot = await get(ref(database, basePath));
              if (baseSnapshot.exists()) {
                const entry = normalizeEntry(baseSnapshot.val(), baseWordKey);
                if (entry && hasTranslations(entry) && this._isValidFormIndexMatch(normalizedKey, entry)) {
                  return entry;
                }
              }
            }
          }
        }
      } catch (indexError) {
        console.warn('[Firebase] forms_index unavailable:', indexError.message);
      }

      return null;
    } catch (error) {
      console.error('[Firebase] Error getting word:', error);
      return null;
    }
  }

  async saveToFirebase(word, data) {
    if (!database || !data) return false;
    const normalizedKey = normalizeWord(word || data.word_normalized || data.word);
    if (!isValidFirebaseKey(normalizedKey)) return false;

    try {
      const entry = normalizeEntry(data, normalizedKey);
      const payload = {
        word: normalizedKey,
        translations: entry.translations,
        gender: entry.gender,
        grammar: entry.grammar,
        forms: entry.forms,
        examples: entry.examples.map(ex => ({ czech: ex.czech, russian: ex.russian })),
        source: entry.source || 'deepseek',
        timestamp: new Date().toISOString(),
        learned_at: entry.learned_at > 0 ? entry.learned_at : Date.now()
      };

      if (entry.ipa) payload.ipa = entry.ipa;
      if (entry.vzor) payload.vzor = entry.vzor;
      if (entry.vazba) payload.vazba = entry.vazba;
      if (entry.cefr_level) payload.cefr_level = entry.cefr_level;
      if (entry.translations_ua.length > 0) payload.translations_ua = entry.translations_ua;
      if (entry.stress) payload.stress = entry.stress;
      if (entry.style) payload.style = entry.style;
      if (entry.is_corrected) payload.is_corrected = true;
      if (entry.aspect_pair) payload.aspect_pair = entry.aspect_pair;
      if (entry.frequency_rank > 0) payload.frequency_rank = entry.frequency_rank;
      if (entry.part_of_speech) payload.part_of_speech = entry.part_of_speech;
      if (entry.isEnriched) payload.isEnriched = true;

      await set(ref(database, `dictionary/${normalizedKey}`), payload);

      // Обновляем forms_index (только валидные ключи)
      if (entry.forms.length > 0) {
        const indexUpdates = {};
        for (const form of entry.forms) {
          const normalizedForm = normalizeWord(form);
          if (isValidFirebaseKey(normalizedForm) && normalizedForm !== normalizedKey) {
            indexUpdates[`forms_index/${normalizedForm}`] = normalizedKey;
          }
        }
        if (Object.keys(indexUpdates).length > 0) {
          await update(ref(database), indexUpdates);
        }
      }

      return true;
    } catch (error) {
      console.error('[Firebase] Save error:', error.message);
      return false;
    }
  }

  async addFormIndex(form, baseWord) {
    if (!database) return;
    const normalizedForm = normalizeWord(form);
    const normalizedBase = normalizeWord(baseWord);
    if (!isValidFirebaseKey(normalizedForm) || !isValidFirebaseKey(normalizedBase) || normalizedForm === normalizedBase) {
      return;
    }
    try {
      await set(ref(database, `forms_index/${normalizedForm}`), normalizedBase);
    } catch (error) {
      console.error('[Firebase] addFormIndex error:', error.message);
    }
  }

  async markPhraseRefreshed(originalKey, refreshedEntry) {
    if (!database || !refreshedEntry) return;
    const normalizedOriginal = normalizeWord(originalKey);
    const normalizedRefreshed = normalizeWord(refreshedEntry.word_normalized || refreshedEntry.word);
    if (!normalizedOriginal.includes(' ') || !isValidFirebaseKey(normalizedOriginal)) return;

    try {
      const now = Date.now();
      const updates = {
        [`phrase_index/${normalizedOriginal}/last_enriched_at`]: now,
        [`phrase_index/${normalizedOriginal}/needs_enrichment`]: false,
        [`phrase_index/${normalizedOriginal}/repair_status`]: 'refreshed'
      };

      if (normalizedRefreshed.includes(' ') && isValidFirebaseKey(normalizedRefreshed) && normalizedRefreshed !== normalizedOriginal) {
        const bucket = phraseBucket(normalizedRefreshed);
        updates[`phrase_index/${normalizedOriginal}/canonical_key`] = normalizedRefreshed;
        updates[`phrase_index/${normalizedOriginal}/repair_status`] = 'repaired';
        updates[`phrase_index/${normalizedRefreshed}/dictionary_key`] = normalizedRefreshed;
        updates[`phrase_index/${normalizedRefreshed}/word_count`] = normalizedRefreshed.split(/\s+/).filter(Boolean).length;
        updates[`phrase_index/${normalizedRefreshed}/char_count`] = normalizedRefreshed.length;
        updates[`phrase_index/${normalizedRefreshed}/bucket`] = bucket;
        updates[`phrase_index/${normalizedRefreshed}/last_enriched_at`] = now;
        updates[`phrase_index/${normalizedRefreshed}/needs_enrichment`] = false;
        updates[`phrase_index/${normalizedRefreshed}/repair_status`] = 'valid';
        updates[`phrase_buckets/${bucket}/${normalizedRefreshed}`] = normalizedRefreshed;
      }

      await update(ref(database), updates);
    } catch (error) {
      console.error('[Firebase] markPhraseRefreshed error:', error.message);
    }
  }

  async _getPhraseBucketKeys(bucket) {
    const bucketSnap = await get(ref(database, `phrase_buckets/${bucket}`));
    if (bucketSnap.exists()) {
      const val = bucketSnap.val();
      const keys = Object.entries(val || {})
        .map(([k, v]) => (typeof v === 'string' ? v : k))
        .filter(item => item && item.includes(' '));
      if (keys.length > 0) return keys;
    }

    const indexQuery = query(ref(database, 'phrase_index'), orderByChild('bucket'), equalTo(bucket));
    const indexSnap = await get(indexQuery);
    if (!indexSnap.exists()) return [];

    const indexVal = indexSnap.val() || {};
    return Object.entries(indexVal)
      .map(([k, v]) => (v && (v.canonical_key || v.dictionary_key)) || k)
      .filter(item => typeof item === 'string' && item.includes(' '));
  }

  /**
   * Получает случайные словосочетания из Firebase (phrase_buckets / phrase_index)
   */
  async getRandomPhrases(limit = 20) {
    if (!database) return [];
    const selectedKeys = new Set();
    const triedBuckets = new Set();

    while (selectedKeys.size < limit && triedBuckets.size < PHRASE_BUCKET_COUNT) {
      let bucket = Math.floor(Math.random() * PHRASE_BUCKET_COUNT);
      while (triedBuckets.has(bucket)) {
        bucket = (bucket + 1) % PHRASE_BUCKET_COUNT;
      }
      triedBuckets.add(bucket);

      try {
        const bucketKeys = await this._getPhraseBucketKeys(bucket);
        // Перемешиваем (Fisher-Yates)
        for (let i = bucketKeys.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [bucketKeys[i], bucketKeys[j]] = [bucketKeys[j], bucketKeys[i]];
        }
        for (const key of bucketKeys) {
          selectedKeys.add(key);
          if (selectedKeys.size >= limit) break;
        }
      } catch (err) {
        console.warn(`[Firebase] Phrase bucket ${bucket} error:`, err.message);
      }
    }

    const keysArray = Array.from(selectedKeys).slice(0, limit);
    const entries = await Promise.all(
      keysArray.map(async (key) => {
        const normalizedKey = normalizeWord(key);
        if (!isValidFirebaseKey(normalizedKey)) return null;
        try {
          const snap = await get(ref(database, `dictionary/${normalizedKey}`));
          if (!snap.exists()) return null;
          const entry = normalizeEntry(snap.val(), normalizedKey);
          if (!entry || !hasTranslations(entry)) return null;
          const fixed = this._preservePhraseKeyIfNeeded(normalizedKey, entry);
          this.saveToLocalStorage(fixed.word_normalized, fixed, { preserveLocalState: true });
          return fixed;
        } catch {
          return null;
        }
      })
    );

    return entries.filter(Boolean);
  }

  // =========================================================================
  // ОСНОВНОЙ ПОТОК ПЕРЕВОДА, ОБОГАЩЕНИЯ И ОБНОВЛЕНИЯ
  // =========================================================================

  isRecordIncomplete(data) {
    if (!data) return true;
    if (data.isEnriched) return false;

    const wordKey = normalizeWord(data.word_normalized || data.word);
    const isPhrase = wordKey.includes(' ');
    const hasNoIpa = !data.ipa;
    const hasNoUa = !(data.translations_ua && data.translations_ua.length > 0);
    // Для словосочетаний пустой vzor — норма (как в Android WordDao.getIncompleteWords)
    const hasNoVzor = !isPhrase && !data.vzor;

    return hasNoIpa || hasNoUa || hasNoVzor;
  }

  /**
   * Приоритет: Memory Cache → LocalStorage → Firebase (Golden DB) → DeepSeek → BaseDict
   */
  async getTranslation(word) {
    this.stats.totalRequests += 1;
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return null;

    // 1a. Кэш в памяти
    const memCached = this.translationCache.get(normalizedWord);
    if (memCached && hasTranslations(memCached)) {
      this.stats.cacheHits += 1;
      return { ...memCached, source: 'cache' };
    }

    // 1b. Кэш в localStorage
    const lsCached = this.getFromLocalStorage(normalizedWord);
    if (lsCached && hasTranslations(lsCached)) {
      this.stats.cacheHits += 1;
      this.translationCache.set(normalizedWord, lsCached);
      return { ...lsCached, source: 'cache' };
    }

    // 2. Firebase (Golden DB)
    const firebaseData = await this.getFromFirebase(normalizedWord);
    if (firebaseData && hasTranslations(firebaseData)) {
      this.stats.firebaseHits += 1;
      const baseKey = normalizeWord(firebaseData.word_normalized || firebaseData.word);
      this.saveToLocalStorage(baseKey, firebaseData, { preserveLocalState: true });
      if (baseKey !== normalizedWord) {
        this.translationCache.set(normalizedWord, firebaseData);
      }
      return firebaseData;
    }

    // 3. DeepSeek API
    const deepSeekData = await this.translateWithDeepSeek(normalizedWord);
    if (deepSeekData && hasTranslations(deepSeekData)) {
      if (!isValidMatch(normalizedWord, deepSeekData.word, deepSeekData.forms)) {
        console.warn(`[DeepSeek] Rejected mismatch: searched="${normalizedWord}", returned="${deepSeekData.word}"`);
      } else {
        this.stats.deepseekHits += 1;
        const isComplete = Boolean(deepSeekData.ipa && deepSeekData.translations_ua.length > 0);
        const entryToSave = {
          ...deepSeekData,
          source: 'deepseek',
          isEnriched: isComplete,
          learned_at: Date.now()
        };
        const baseKey = normalizeWord(entryToSave.word_normalized || entryToSave.word);

        this.saveToLocalStorage(baseKey, entryToSave, { preserveLocalState: true });
        this.saveToFirebase(baseKey, entryToSave);

        if (normalizedWord !== baseKey) {
          this.translationCache.set(normalizedWord, entryToSave);
          this.addFormIndex(normalizedWord, baseKey);
        }

        return entryToSave;
      }
    }

    // 4. Fallback (BaseDict)
    const fallbackData = this.baseDict.getTranslation(normalizedWord);
    if (fallbackData) {
      this.stats.fallbackHits += 1;
      const entry = normalizeEntry({ ...fallbackData, source: 'fallback' }, normalizedWord);
      return entry;
    }

    return null;
  }

  /**
   * Быстрый обратный словарь (RU/UA → одно чешское слово):
   * 1) ищет точное совпадение перевода в локальном кэше (0 сети);
   * 2) обращается к DeepSeek (mode = "reverse");
   * 3) проверяет найденное чешское слово в Golden DB (Firebase) —
   *    кириллические ключи в Firebase никогда не сохраняются.
   */
  async lookupCzechByNativeWord(queryText) {
    const normalizedQuery = normalizeWord(queryText);
    if (!normalizedQuery) return null;

    // 1. Локальный кэш: точное совпадение перевода (сначала самые частые)
    const allLocal = this.getAllCachedWords().sort((a, b) => {
      const rankA = a.frequency_rank > 0 ? a.frequency_rank : 999999;
      const rankB = b.frequency_rank > 0 ? b.frequency_rank : 999999;
      return rankA - rankB;
    });
    const localHit = allLocal.find(
      entry =>
        (entry.translations || []).some(tr => normalizeWord(tr) === normalizedQuery) ||
        (entry.translations_ua || []).some(tr => normalizeWord(tr) === normalizedQuery)
    );
    if (localHit) {
      return { ...localHit, source: 'cache' };
    }

    // 2. DeepSeek reverse lookup (RU/UA → CZ)
    const reverseEntry = await this.translateWithDeepSeek(normalizedQuery, 'reverse');
    if (!reverseEntry || !hasTranslations(reverseEntry)) return null;

    const czechKey = normalizeWord(reverseEntry.word_normalized || reverseEntry.word);
    if (!czechKey || hasCyrillic(czechKey)) return null;

    // 3. Проверяем Golden DB по чешскому ключу, чтобы не затереть проверенную запись
    const goldenEntry = await this.getFromFirebase(czechKey);
    if (goldenEntry && hasTranslations(goldenEntry)) {
      this.saveToLocalStorage(czechKey, goldenEntry, { preserveLocalState: true });
      return goldenEntry;
    }

    // 4. Сохраняем новую чешскую запись под чешским ключом
    const isComplete = Boolean(reverseEntry.ipa && reverseEntry.translations_ua.length > 0);
    const entryToSave = {
      ...reverseEntry,
      word: czechKey,
      word_normalized: czechKey,
      source: 'deepseek',
      isEnriched: isComplete,
      learned_at: Date.now()
    };
    this.saveToLocalStorage(czechKey, entryToSave, { preserveLocalState: true });
    await this.saveToFirebase(czechKey, entryToSave);
    return entryToSave;
  }

  /**
   * Фоновое обогащение неполной записи (не блокирует UI, мержит поля безопасно)
   */
  async enrichWord(existingEntry) {
    if (!existingEntry || !this.isRecordIncomplete(existingEntry)) return null;
    const baseKey = normalizeWord(existingEntry.word_normalized || existingEntry.word);
    if (!baseKey) return null;

    const enriched = await this.translateWithDeepSeek(baseKey);
    if (!enriched || !hasTranslations(enriched)) return null;
    if (!isValidMatch(baseKey, enriched.word, enriched.forms)) return null;

    const isPhrase = baseKey.includes(' ');
    const cached = this.getFromLocalStorage(baseKey) || normalizeEntry(existingEntry, baseKey);

    const merged = {
      ...cached,
      translations: (isPhrase || !cached.translations.length)
        ? (enriched.translations.length ? enriched.translations : cached.translations)
        : cached.translations,
      forms: (isPhrase || !cached.forms.length)
        ? (enriched.forms.length ? enriched.forms : cached.forms)
        : cached.forms,
      examples: (isPhrase || !cached.examples.length)
        ? (enriched.examples.length ? enriched.examples : cached.examples)
        : cached.examples,
      ipa: enriched.ipa || cached.ipa,
      vzor: enriched.vzor || cached.vzor,
      vazba: enriched.vazba || cached.vazba,
      cefr_level: enriched.cefr_level || cached.cefr_level,
      translations_ua: enriched.translations_ua.length ? enriched.translations_ua : cached.translations_ua,
      stress: enriched.stress || cached.stress,
      style: enriched.style || cached.style,
      aspect_pair: enriched.aspect_pair || cached.aspect_pair,
      frequency_rank: enriched.frequency_rank > 0 ? enriched.frequency_rank : cached.frequency_rank,
      part_of_speech: enriched.part_of_speech || cached.part_of_speech,
      isEnriched: true
    };

    this.saveToLocalStorage(baseKey, merged, { preserveLocalState: true });
    await this.saveToFirebase(baseKey, merged);
    if (isPhrase) {
      await this.markPhraseRefreshed(baseKey, merged);
    }

    return merged;
  }

  /**
   * Принудительное обновление карточки через DeepSeek (кнопка «обновить»)
   */
  async refreshWord(word) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return null;

    const deepSeekEntry = await this.translateWithDeepSeek(normalizedWord);
    if (!deepSeekEntry || !hasTranslations(deepSeekEntry)) return null;
    if (!isValidMatch(normalizedWord, deepSeekEntry.word, deepSeekEntry.forms)) return null;

    const isComplete = Boolean(deepSeekEntry.ipa && deepSeekEntry.translations_ua.length > 0);
    const entryToSave = {
      ...deepSeekEntry,
      source: 'deepseek',
      isEnriched: isComplete
    };
    const baseKey = normalizeWord(entryToSave.word_normalized || entryToSave.word);

    this.saveToLocalStorage(baseKey, entryToSave, { preserveLocalState: true });
    await this.saveToFirebase(baseKey, entryToSave);
    if (normalizedWord.includes(' ')) {
      await this.markPhraseRefreshed(normalizedWord, entryToSave);
    }

    return entryToSave;
  }

  clearCache() {
    this.translationCache.clear();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Error clearing localStorage cache:', error);
    }
  }

  getStats() {
    const total = this.stats.totalRequests || 1;
    return {
      ...this.stats,
      cacheHitRate: ((this.stats.cacheHits / total) * 100).toFixed(2) + '%',
      firebaseHitRate: ((this.stats.firebaseHits / total) * 100).toFixed(2) + '%',
      deepseekHitRate: ((this.stats.deepseekHits / total) * 100).toFixed(2) + '%',
      fallbackHitRate: ((this.stats.fallbackHits / total) * 100).toFixed(2) + '%',
      cacheSize: this.translationCache.size
    };
  }
}

const dataService = new DataService();

export { dataService, DataService };
