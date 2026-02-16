/**
 * DataService.js
 * Централизованное управление данными с использованием AI (DeepSeek)
 * Приоритет источников: Cache → Firebase → DeepSeek AI → BaseDict
 * LocalStorage используется только для кэширования
 */

import { ref, set, get } from 'firebase/database';
import { database } from '../firebase';
import { BaseDict } from '../utils/BaseDict';

class DataService {
  constructor() {
    this.baseDict = new BaseDict();
    this.connectionStatus = {
      firebase: false,
      deepseek: true // AI доступен через прокси
    };
    this.translationCache = new Map();
    this.pendingBatchOperations = [];
    this.stats = {
      cacheHits: 0,
      firebaseHits: 0,
      deepseekHits: 0,
      fallbackHits: 0,
      totalRequests: 0
    };

    // Инициализация Firebase
    this.initConnections();
  }

  /**
   * Инициализирует соединение с Firebase
   */
  async initConnections() {
    try {
      this.connectionStatus.firebase = await this.checkFirebaseConnection();
      console.log(`Firebase connection: ${this.connectionStatus.firebase ? 'OK' : 'FAILED'}`);
      console.log(`DeepSeek AI: via Netlify Functions`);

      if (this.connectionStatus.firebase) {
        console.log(`[Firebase] 🔗 Database URL:`, database.app.options.databaseURL);
      }
    } catch (error) {
      console.error('Error initializing connections:', error);
    }
  }

  /**
   * Проверяет соединение с Firebase
   */
  async checkFirebaseConnection() {
    try {
      if (!database) {
        console.warn('Firebase database not initialized');
        return false;
      }

      // Простая проверка - пытаемся прочитать тестовую ноду
      const testRef = ref(database, 'test');
      const snapshot = await get(testRef);

      // Если прочитали без ошибок - соединение есть
      return true;
    } catch (error) {
      console.error('Error checking Firebase connection:', error);
      return false;
    }
  }

  /**
   * Перевод через DeepSeek API (через прокси)
   * Создает "Золотую запись" на лету
   */
  async translateWithDeepSeek(word) {
    try {
      console.log(`[DeepSeek] Requesting: "${word}"`);
      const response = await fetch('/.netlify/functions/translate-deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: word })
      });

      if (!response.ok) throw new Error(`DeepSeek Error: ${response.status}`);

      const data = await response.json();
      console.log(`[DeepSeek] Success: ${data.word}`);
      return { ...data, success: true };
    } catch (error) {
      console.error('[DeepSeek] Error:', error);
      return null;
    }
  }

  /**
   * Пакетная проверка существования слов в базе (кэш + Firebase)
   * Помогает избежать лишних вызовов AI
   */
  async checkWordsExistence(words) {
    const results = {};
    const wordsToCheck = [...new Set(words.map(w => w.toLowerCase().trim()))];

    for (const word of wordsToCheck) {
      // Сначала смотрим кэш
      if (this.translationCache.has(word)) {
        results[word] = true;
        continue;
      }

      // Затем Firebase
      if (this.connectionStatus.firebase) {
        try {
          const data = await this.getFromFirebase(word);
          if (data && data.translations && data.translations.length > 0) {
            results[word] = true;
            // Сразу кэшируем, чтобы потом не лезть в сеть
            this.translationCache.set(word, data);
            continue;
          }
        } catch (e) {
          console.error(`Error checking ${word}:`, e);
        }
      }

      results[word] = false;
    }
    return results;
  }

  /**
   * Проверяет, является ли запись "неполной" (требующей дообогащения)
   * Проверяем реальные поля, а не флаг isEnriched
   */
  isRecordIncomplete(data) {
    if (!data) return true;
    
    // Если уже было "дообогащено", не трогаем (чтобы избежать циклов)
    if (data.isEnriched) return false;

    const hasNoIpa = !data.ipa;
    const hasNoVzor = !data.vzor;
    const hasNoUaTranslations = !data.translations_ua || !data.translations_ua.length;
    const hasNoCefr = !data.cefr_level && !data.cefrLevel;

    return hasNoIpa || hasNoVzor || hasNoUaTranslations || hasNoCefr;
  }

  /**
   * Получает перевод слова с автоматическим выбором источника
   * Приоритет: Cache → Firebase (Golden DB) → DeepSeek → BaseDict → DeepL
   */
  async getTranslation(word, options = {}) {
    this.stats.totalRequests++;
    const normalizedWord = this.normalizeUnicode(word);

    console.log(`🔍 Translating: "${word}"`);

    // 1. Локальный кэш
    const cachedTranslation = this.translationCache.get(normalizedWord);
    if (cachedTranslation) {
      console.log(`✅ Found in cache`);
      return { ...cachedTranslation, source: 'cache' };
    }

    // 2. Firebase (Golden DB)
    if (this.connectionStatus.firebase) {
      try {
        const firebaseData = await this.getFromFirebase(normalizedWord);
        if (firebaseData) {
          // ПРОВЕРКА НА ПОЛНОТУ ДАННЫХ (Enrichment)
          if (this.isRecordIncomplete(firebaseData) && this.connectionStatus.deepseek) {
            console.log(`⚠️ Record for "${normalizedWord}" is incomplete. Fetching enrichment...`);
            const enrichedData = await this.translateWithDeepSeek(normalizedWord);
            if (enrichedData && enrichedData.success) {
              const finalData = { ...enrichedData, isEnriched: true };
              await this.saveToFirebase(normalizedWord, finalData);
              this.translationCache.set(normalizedWord, finalData);
              return { ...finalData, source: 'deepseek-enriched' };
            }
          }

          console.log(`✅ Found in Firebase`);
          this.stats.firebaseHits++;
          this.translationCache.set(normalizedWord, firebaseData);
          this.saveToLocalStorage(normalizedWord, firebaseData);
          return { ...firebaseData, source: firebaseData.source || 'firebase' };
        }
      } catch (e) {
        console.error(`❌ Firebase error:`, e);
      }
    }

    // 3. DeepSeek API (Генерация новой золотой записи)
    try {
      const deepSeekData = await this.translateWithDeepSeek(normalizedWord);
      if (deepSeekData && deepSeekData.success) {
        if (this.connectionStatus.firebase) {
          // Сохраняем в Firebase, чтобы в следующий раз взять оттуда
          await this.saveToFirebase(deepSeekData.word_normalized || normalizedWord, deepSeekData);
        }
        return { ...deepSeekData, source: 'deepseek' };
      }
    } catch (e) { console.error(e); }

    // 4. Fallback (BaseDict) - для простых слов, если DeepSeek не ответил
    const fallbackData = this.getFromBaseDict(normalizedWord);
    if (fallbackData) return { ...fallbackData, source: 'fallback' };

    // 5. No more fallbacks (DeepL removed)
    return { word: normalizedWord, translations: [], forms: [], source: 'none', error: 'Not found' };
  }

  /**
   * Получает данные из localStorage
   */
  getFromLocalStorage(word) {
    try {
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      const normalizedKey = this.normalizeUnicode(word);
      return cache[normalizedKey] || null;
    } catch (error) {
      console.error('Error getting from localStorage:', error);
      return null;
    }
  }

  /**
   * Сохраняет данные в localStorage
   */
  saveToLocalStorage(word, data) {
    try {
      const cacheKey = 'flashcards_seznam_cache';
      let cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      const normalizedKey = this.normalizeUnicode(word);

      cache[normalizedKey] = {
        ...data,
        cachedAt: new Date().toISOString()
      };

      // Ограничиваем размер кэша
      const now = new Date();
      const entries = Object.entries(cache);

      const filteredEntries = entries
        .filter(([_, entry]) => {
          const cachedAt = new Date(entry.cachedAt);
          const diffDays = (now - cachedAt) / (1000 * 60 * 60 * 24);
          return diffDays < 30;
        })
        .sort((a, b) => new Date(b[1].cachedAt) - new Date(a[1].cachedAt))
        .slice(0, 500);

      const updatedCache = Object.fromEntries(filteredEntries);
      localStorage.setItem(cacheKey, JSON.stringify(updatedCache));

      return true;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      return false;
    }
  }

  /**
   * Нормализует Unicode строку (NFC форма для совместимости с Firebase)
   */
  normalizeUnicode(str) {
    // Приводим к NFC (Canonical Decomposition, followed by Canonical Composition)
    return str.normalize('NFC').toLowerCase().trim();
  }

  /**
   * Получает данные из Firebase
   */
  async getFromFirebase(word) {
    try {
      const normalizedKey = this.normalizeUnicode(word);

      // Пробуем несколько путей
      const pathsToTry = [
        normalizedKey,                    // Корень: /haldamáš
        `dictionary/${normalizedKey}`,    // dictionary/haldamáš
        `words/${normalizedKey}`          // words/haldamáš
      ];

      for (const path of pathsToTry) {
        const wordRef = ref(database, path);
        const snapshot = await get(wordRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          return data;
        }
      }

      // ПОИСК ПО ИНДЕКСУ СЛОВОФОРМ (БЫСТРО!)
      try {
        console.log(`🔍 Searching in forms_index...`);
        const indexRef = ref(database, `forms_index/${normalizedKey}`);
        const indexSnapshot = await get(indexRef);

        if (indexSnapshot.exists()) {
          const baseWordKey = indexSnapshot.val();
          console.log(`✅ Found in index: "${word}" → "${baseWordKey}"`);

          // Получаем базовое слово напрямую (без рекурсии)
          const basePathsToTry = [
            baseWordKey,
            `dictionary/${baseWordKey}`,
            `words/${baseWordKey}`
          ];

          for (const basePath of basePathsToTry) {
            const baseRef = ref(database, basePath);
            const baseSnapshot = await get(baseRef);

            if (baseSnapshot.exists()) {
              const data = baseSnapshot.val();
              console.log(`✅ Found base word at: ${basePath}`);
              return data;
            }
          }
        } else {
          console.log(`❌ Not found in forms_index`);
        }
      } catch (indexError) {
        console.log(`⚠️ forms_index not available:`, indexError.message);
      }

      return null;
    } catch (error) {
      console.error('[Firebase] 💥 Error getting from Firebase:', error);
      return null;
    }
  }

  /**
   * Сохраняет данные в Firebase
   */
  async saveToFirebase(word, data) {
    try {
      const normalizedKey = this.normalizeUnicode(word);
      const wordRef = ref(database, `dictionary/${normalizedKey}`);

      await set(wordRef, {
        word: normalizedKey,
        translations: data.translations || [],
        translations_ua: data.translations_ua || data.translationsUa || [],
        examples: data.examples || [],
        gender: data.gender || '',
        grammar: data.grammar || '',
        forms: data.forms || [],
        ipa: data.ipa || '',
        vzor: data.vzor || '',
        stress: data.stress || '',
        vazba: data.vazba || '',
        aspect_pair: data.aspect_pair || data.aspectPair || '',
        style: data.style || '',
        cefr_level: data.cefr_level || data.cefrLevel || '',
        frequency_rank: data.frequency_rank || data.frequencyRank || 0,
        isEnriched: data.isEnriched || false,
        learned_at: data.learned_at || Date.now(),
        timestamp: new Date().toISOString(),
        source: data.source || 'deepseek',
        detectedSourceLang: data.detectedSourceLang || 'CS'
      });

      // Обновляем forms_index: каждая словоформа → базовое слово
      const forms = data.forms || [];
      if (forms.length > 0) {
        const indexUpdates = {};
        for (const form of forms) {
          const normalizedForm = this.normalizeUnicode(form);
          if (normalizedForm && normalizedForm !== normalizedKey) {
            indexUpdates[`forms_index/${normalizedForm}`] = normalizedKey;
          }
        }
        if (Object.keys(indexUpdates).length > 0) {
          const { update } = await import('firebase/database');
          const rootRef = ref(database);
          await update(rootRef, indexUpdates);
          console.log(`📇 forms_index updated: ${Object.keys(indexUpdates).length} forms → "${normalizedKey}"`);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Firebase save error:', error.message);
      return false;
    }
  }

  /**
   * Получает данные из базового словаря
   */
  getFromBaseDict(word) {
    return this.baseDict.getTranslation(word);
  }

  /**
   * Получает статистику
   */
  getStats() {
    const total = this.stats.totalRequests || 1;

    return {
      ...this.stats,
      cacheHitRate: ((this.stats.cacheHits / total) * 100).toFixed(2) + '%',
      firebaseHitRate: ((this.stats.firebaseHits / total) * 100).toFixed(2) + '%',
      deepseekHitRate: ((this.stats.deepseekHits / total) * 100).toFixed(2) + '%',
      fallbackHitRate: ((this.stats.fallbackHits / total) * 100).toFixed(2) + '%',
      cacheSize: this.translationCache.size,
      connectionStatus: this.connectionStatus
    };
  }

  /**
   * Очищает кэш
   */
  clearCache() {
    this.translationCache.clear();
    try {
      localStorage.removeItem('flashcards_seznam_cache');
    } catch (error) {
      console.error('Error clearing localStorage cache:', error);
    }
  }

  /**
   * Добавляет слово в пакетную очередь
   */
  async addToBatch(word) {
    if (!this.pendingBatchOperations) {
      this.pendingBatchOperations = [];
    }
    this.pendingBatchOperations.push(word);

    // Если набралось достаточно слов, запускаем обработку
    if (this.pendingBatchOperations.length >= 5) {
      await this.processBatch();
    }
  }

  /**
   * Обрабатывает пакет слов
   */
  async processBatch() {
    if (!this.pendingBatchOperations || this.pendingBatchOperations.length === 0) {
      // Тихо возвращаем, если нет слов для обработки (например, только служебные слова)
      return { processed: 0, total: 0, success: 0, failed: 0, details: [] };
    }

    const batchWords = [...this.pendingBatchOperations];
    this.pendingBatchOperations = [];

    const results = {
      total: batchWords.length,
      success: 0,
      failed: 0,
      details: []
    };

    for (let i = 0; i < batchWords.length; i++) {
      const word = batchWords[i];

      try {
        // Добавляем задержку между запросами (чтобы не перегрузить DeepL)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const translation = await this.getTranslation(word);

        if (translation && translation.translations && translation.translations.length > 0) {
          results.success++;
          results.details.push({
            word,
            success: true,
            source: translation.source
          });
        } else {
          results.failed++;
          results.details.push({
            word,
            success: false,
            error: translation?.error || 'Translation not found'
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          word,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Синхронизирует данные между источниками (Firebase, localStorage, cache)
   */
  async syncData() {
    try {
      const results = {
        firebaseToLocal: 0,
        localToFirebase: 0,
        total: 0
      };

      // Получаем все данные из Firebase
      const firebaseData = await this.getAllFromFirebase();

      // Получаем данные из localStorage
      const localData = JSON.parse(localStorage.getItem(this.localStorageKey) || '{}');

      // Синхронизация: Firebase → localStorage
      if (firebaseData) {
        for (const [word, data] of Object.entries(firebaseData)) {
          if (!localData[word]) {
            localData[word] = data;
            results.firebaseToLocal++;
          }
        }
      }

      // Синхронизация: localStorage → Firebase
      for (const [word, data] of Object.entries(localData)) {
        if (!firebaseData || !firebaseData[word]) {
          await this.saveToFirebase(word, data);
          results.localToFirebase++;
        }
      }

      // Сохраняем обновленный localStorage
      localStorage.setItem(this.localStorageKey, JSON.stringify(localData));

      results.total = Object.keys(localData).length;

      console.log('[DataService] Sync completed:', results);
      return results;
    } catch (error) {
      console.error('[DataService] Sync error:', error);
      throw new Error(`Ошибка синхронизации: ${error.message}`);
    }
  }

  /**
   * Получает все данные из Firebase
   */
  async getAllFromFirebase() {
    try {
      const response = await fetch(
        `${this.firebaseUrl}/${this.firebaseKey}.json`
      );

      if (!response.ok) {
        throw new Error(`Firebase error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[DataService] Error fetching all from Firebase:', error);
      return null;
    }
  }
}

// Создаем и экспортируем экземпляр
const dataService = new DataService();

export { dataService, DataService };
