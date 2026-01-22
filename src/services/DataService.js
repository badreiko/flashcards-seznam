/**
 * DataService.js
 * Централизованное управление данными с DeepL API
 * Приоритет источников: Cache → Firebase → DeepL API → BaseDict
 * LocalStorage используется только для кэширования
 */

import { ref, set, get } from 'firebase/database';
import { database } from '../firebase';
import { BaseDict } from '../utils/BaseDict';

// Netlify Function URL для DeepL API (через прокси для обхода CORS)
const DEEPL_PROXY_URL = '/.netlify/functions/translate-deepl';

class DataService {
  constructor() {
    this.baseDict = new BaseDict();
    this.connectionStatus = {
      firebase: false,
      deepl: true // DeepL всегда доступен (если есть API ключ)
    };
    this.translationCache = new Map();
    this.pendingBatchOperations = [];
    this.stats = {
      cacheHits: 0,
      firebaseHits: 0,
      deeplHits: 0,
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
      console.log(`DeepL API: via Netlify Functions`);
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
   * Перевод через DeepL API (через Netlify Function прокси)
   * Получаем несколько вариантов перевода через разные контексты
   */
  async translateWithDeepL(word, retryCount = 0) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 2000; // 2 секунды

    try {
      console.log(`[DeepL] Translating: "${word}"${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);

      // Запрашиваем слово в разных контекстах для получения альтернативных переводов
      const contexts = [
        `${word}.`, // Слово как предложение (лучше чем просто слово)
        `Musím ${word}`, // В контексте глагола (должен...)
        `To je ${word}`, // В контексте существительного/прилагательного (это...)
        `Chci ${word}`, // Хочу... (для глаголов)
        `Mám ${word}` // Имею... (для существительных)
      ];

      const response = await fetch(DEEPL_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: contexts,
          source_lang: 'CS',
          target_lang: 'RU'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Если 503 (Service Unavailable) или 429 (Too Many Requests) - повторяем
        if ((response.status === 503 || response.status === 429) && retryCount < MAX_RETRIES) {
          console.warn(`[DeepL] Rate limit hit, retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return this.translateWithDeepL(word, retryCount + 1);
        }

        throw new Error(`DeepL Proxy error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.translations || data.translations.length === 0) {
        throw new Error('No translations returned from DeepL');
      }

      // Собираем уникальные переводы из всех вариантов
      const translations = [];
      const examples = [];

      data.translations.forEach((t, index) => {
        const translatedText = t.text.trim();

        if (index === 0) {
          // Первый вариант - убираем точку
          const cleaned = translatedText.replace(/\.$/, '');
          translations.push(cleaned);
        } else {
          // Извлекаем перевод слова из контекста
          const contextTranslation = this.extractWordFromContext(translatedText, index);
          if (contextTranslation && !translations.includes(contextTranslation)) {
            translations.push(contextTranslation);
          }
          // Добавляем примеры использования
          examples.push({
            czech: contexts[index],
            russian: translatedText
          });
        }
      });

      const result = {
        word: word,
        translations: translations.slice(0, 5), // Максимум 5 вариантов
        examples: examples.slice(0, 3), // Максимум 3 примера
        gender: '', // Будет заполнено из SQLite
        grammar: '', // Будет заполнено из SQLite
        forms: [],   // Будет заполнено из SQLite
        detectedSourceLang: data.translations[0].detected_source_language || 'CS',
        source: 'deepl',
        success: true
      };

      console.log(`[DeepL] ✅ Success: ${translations.length} translations:`, translations);
      return result;

    } catch (error) {
      console.error(`[DeepL] ❌ Error:`, error);
      return null;
    }
  }

  /**
   * TODO: Перевод через DeepSeek API (будущая интеграция)
   * DeepSeek будет использоваться как дополнительный источник для:
   * - Проверки качества переводов DeepL
   * - Получения альтернативных вариантов перевода
   * - Генерации дополнительных примеров использования
   *
   * Приоритет после добавления DeepSeek:
   * 1. Cache
   * 2. Firebase
   * 3. DeepL API (основной)
   * 4. DeepSeek API (вспомогательный/fallback)
   * 5. BaseDict
   *
   * @param {string} word - Слово для перевода
   * @returns {Promise<Object>} - Результат перевода
   */
  async translateWithDeepSeek(word) {
    // TODO: Реализовать интеграцию с DeepSeek API
    // URL: https://api.deepseek.com/v1/chat/completions
    // Модель: deepseek-chat
    //
    // Пример промпта:
    // "Переведи чешское слово '{word}' на русский язык.
    //  Верни только перевод без объяснений."
    //
    // Формат ответа должен быть:
    // {
    //   word: word,
    //   translations: [...],
    //   examples: [...],
    //   source: 'deepseek',
    //   success: true
    // }

    console.log(`[DeepSeek] TODO: Implement DeepSeek translation for: "${word}"`);
    return null;
  }

  /**
   * Извлекает перевод слова из контекстного перевода
   */
  extractWordFromContext(contextTranslation, contextIndex) {
    // Убираем известные контекстные фразы
    const patterns = [
      /^Я должен\s+(.+)$/i,
      /^Должен\s+(.+)$/i,
      /^Мне нужно\s+(.+)$/i,
      /^Я хочу\s+(.+)$/i,
      /^Хочу\s+(.+)$/i,
      /^У меня есть\s+(.+)$/i,
      /^Я имею\s+(.+)$/i,
      /^Имею\s+(.+)$/i,
      /^Это\s+(.+)$/i,
      /^Это -\s+(.+)$/i,
      /^Это:\s+(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = contextTranslation.match(pattern);
      if (match) {
        return match[1].trim().replace(/[.,!?;:]$/, '');
      }
    }

    // Если не нашли паттерн, возвращаем последнее слово/фразу
    const words = contextTranslation.trim().split(/\s+/);
    if (words.length > 2) {
      // Если больше 2 слов, берём последние 2-3 слова (это может быть фраза типа "отметить галочкой")
      return words.slice(-3).join(' ').replace(/[.,!?;:]$/, '');
    }
    return words[words.length - 1].replace(/[.,!?;:]$/, '');
  }

  /**
   * Пакетная проверка существования слов в базе (кэш + Firebase)
   * Помогает избежать лишних вызовов DeepL
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
   * Получает перевод слова с автоматическим выбором источника
   * Приоритет: Cache → Firebase → DeepL → BaseDict
   */
  async getTranslation(word, options = {}) {
    this.stats.totalRequests++;
    const normalizedWord = word.toLowerCase().trim();

    // Шаг 1: Проверяем локальный кэш в памяти
    const cachedTranslation = this.translationCache.get(normalizedWord);
    if (cachedTranslation) {
      this.stats.cacheHits++;
      return {
        ...cachedTranslation,
        source: 'cache'
      };
    }

    // Шаг 2: Проверяем Firebase (главный источник после кэша)
    if (this.connectionStatus.firebase) {
      try {
        const firebaseData = await this.getFromFirebase(normalizedWord);
        if (firebaseData && firebaseData.translations && firebaseData.translations.length > 0) {
          this.stats.firebaseHits++;
          // Сохраняем в кэш для быстрого доступа
          this.translationCache.set(normalizedWord, firebaseData);
          this.saveToLocalStorage(normalizedWord, firebaseData);
          return {
            ...firebaseData,
            source: 'firebase'
          };
        }
      } catch (error) {
        console.error('[Firebase] Error fetching from Firebase:', error);
      }
    }

    // Шаг 3: Проверяем служебные слова (предлоги, союзы, частицы)
    // Такие слова не переводятся через DeepL - сразу идём в fallback
    const serviceWords = new Set([
      'a', 'i', 'o', 'u', 'v', 've', 'z', 'ze', 's', 'se', 'k', 'ke', 'na', 'za', 'po', 'do', 'od', 'ode',
      'pro', 'při', 'před', 'přede', 'bez', 'beze', 'mimo', 'skrz', 'skrze', 'mezi', 'nad', 'nade', 'pod', 'pode',
      'ale', 'nebo', 'ani', 'že', 'když', 'pokud', 'jestli', 'protože', 'ano', 'ne', 'jo', 'už', 'ještě'
    ]);

    if (serviceWords.has(normalizedWord)) {
      console.log(`[DeepL] Skipping service word: "${normalizedWord}"`);
      // Пропускаем DeepL API для служебных слов - идём в fallback
      const fallbackData = this.getFromBaseDict(normalizedWord);
      if (fallbackData) {
        this.stats.fallbackHits++;
        this.translationCache.set(normalizedWord, fallbackData);
        return {
          ...fallbackData,
          source: 'fallback'
        };
      }
    }

    // Шаг 4: Запрашиваем DeepL API (если не нашли в Firebase)
    try {
      const deeplData = await this.translateWithDeepL(normalizedWord);
      if (deeplData && deeplData.success) {
        this.stats.deeplHits++;

        // Сохраняем в Firebase (главное хранилище) и localStorage
        if (this.connectionStatus.firebase) {
          await this.saveToFirebase(normalizedWord, deeplData);
        }
        this.saveToLocalStorage(normalizedWord, deeplData);
        this.translationCache.set(normalizedWord, deeplData);

        return {
          ...deeplData,
          source: 'deepl'
        };
      }
    } catch (error) {
      console.error('[DeepL] Error fetching from DeepL:', error);
    }

    // Шаг 5: Используем базовый словарь как fallback
    const fallbackData = this.getFromBaseDict(normalizedWord);
    if (fallbackData) {
      this.stats.fallbackHits++;
      this.translationCache.set(normalizedWord, fallbackData);
      return {
        ...fallbackData,
        source: 'fallback'
      };
    }

    // Ничего не найдено
    return {
      word: normalizedWord,
      translations: [],
      examples: [],
      gender: '',
      grammar: '',
      forms: [],
      source: 'none',
      error: 'Translation not found'
    };
  }

  /**
   * Получает данные из localStorage
   */
  getFromLocalStorage(word) {
    try {
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      return cache[word.toLowerCase()] || null;
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

      cache[word.toLowerCase()] = {
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
   * Получает данные из Firebase
   */
  async getFromFirebase(word) {
    try {
      const wordRef = ref(database, `dictionary/${word.toLowerCase()}`);
      const snapshot = await get(wordRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }
      return null;
    } catch (error) {
      console.error('Error getting from Firebase:', error);
      return null;
    }
  }

  /**
   * Сохраняет данные в Firebase
   */
  async saveToFirebase(word, data) {
    try {
      const wordRef = ref(database, `dictionary/${word.toLowerCase()}`);
      await set(wordRef, {
        word: word.toLowerCase(),
        translations: data.translations || [],
        examples: data.examples || [],
        gender: data.gender || '',
        grammar: data.grammar || '',
        forms: data.forms || [],
        timestamp: new Date().toISOString(),
        source: data.source || 'deepl',
        detectedSourceLang: data.detectedSourceLang || 'CS'
      });
      return true;
    } catch (error) {
      console.error('Error saving to Firebase:', error);
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
      deeplHitRate: ((this.stats.deeplHits / total) * 100).toFixed(2) + '%',
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
