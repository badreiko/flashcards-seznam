/**
 * DataService.js
 * Централизованное управление данными с DeepL API
 * Приоритет источников: Cache → LocalStorage → Firebase → DeepL API → BaseDict
 */

import { ref, set, get } from 'firebase/database';
import { database } from '../firebase';
import { BaseDict } from '../utils/BaseDict';
import { normalizationService } from './NormalizationService';

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

      // Простая проверка - пытаемся прочитать из базы
      const testRef = ref(database, '.info/connected');
      const snapshot = await get(testRef);
      const isConnected = snapshot.val() === true;

      return isConnected;
    } catch (error) {
      console.error('Error checking Firebase connection:', error);
      return false;
    }
  }

  /**
   * Перевод через DeepL API (через Netlify Function прокси)
   * Получаем несколько вариантов перевода через разные контексты
   */
  async translateWithDeepL(word) {
    try {
      console.log(`[DeepL] Translating: "${word}"`);

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
   * Получает перевод слова с автоматическим выбором источника
   */
  async getTranslation(word, options = {}) {
    this.stats.totalRequests++;
    const normalizedWord = word.toLowerCase().trim();

    // Шаг 1: Проверяем локальный кэш
    const cachedTranslation = this.translationCache.get(normalizedWord);
    if (cachedTranslation) {
      this.stats.cacheHits++;
      return {
        ...cachedTranslation,
        source: 'cache'
      };
    }

    // Шаг 2: Проверяем localStorage
    const localData = this.getFromLocalStorage(normalizedWord);
    if (localData) {
      this.translationCache.set(normalizedWord, localData);
      return {
        ...localData,
        source: 'localStorage'
      };
    }

    // Шаг 3: Проверяем Firebase
    if (this.connectionStatus.firebase) {
      try {
        const firebaseData = await this.getFromFirebase(normalizedWord);
        if (firebaseData) {
          this.stats.firebaseHits++;
          this.saveToLocalStorage(normalizedWord, firebaseData);
          this.translationCache.set(normalizedWord, firebaseData);
          return {
            ...firebaseData,
            source: 'firebase'
          };
        }
      } catch (error) {
        console.error('Error fetching from Firebase:', error);
      }
    }

    // Шаг 4: Пробуем нормализацию и повторяем поиск
    if (!options.skipNormalization) {
      const normalizationResult = normalizationService.normalize(normalizedWord);

      if (normalizationResult.usedNormalization) {
        for (const normalizedForm of normalizationResult.normalizedForms) {
          if (normalizedForm !== normalizedWord) {
            const normalizedTranslation = await this.getTranslation(normalizedForm, {
              skipNormalization: true,
              originalWord: normalizedWord
            });

            if (normalizedTranslation && normalizedTranslation.translations && normalizedTranslation.translations.length > 0) {
              const result = {
                ...normalizedTranslation,
                originalWord: normalizedWord,
                normalizedWord: normalizedForm,
                normalizationInfo: normalizationResult,
                usedNormalization: true
              };

              this.translationCache.set(normalizedWord, result);
              this.saveToLocalStorage(normalizedWord, result);

              return result;
            }
          }
        }
      }
    }

    // Шаг 5: Запрашиваем DeepL API
    try {
      const deeplData = await this.translateWithDeepL(normalizedWord);
      if (deeplData && deeplData.success) {
        this.stats.deeplHits++;

        // Сохраняем в Firebase и localStorage
        if (this.connectionStatus.firebase) {
          this.saveToFirebase(normalizedWord, deeplData);
        }
        this.saveToLocalStorage(normalizedWord, deeplData);
        this.translationCache.set(normalizedWord, deeplData);

        return {
          ...deeplData,
          source: 'deepl'
        };
      }
    } catch (error) {
      console.error('Error fetching from DeepL:', error);
    }

    // Шаг 6: Используем базовый словарь как fallback
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
      return { processed: 0 };
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
}

// Создаем и экспортируем экземпляр
const dataService = new DataService();

export { dataService, DataService };
