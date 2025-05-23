/**
 * DataService.js
 * Централизованное управление данными с автоматическим переключением между источниками
 * и поддержкой batch операций
 */

import { ref, set, get, update, onValue } from 'firebase/database';
import { database } from '../firebase';
import { BaseDict } from '../utils/BaseDict';
import { normalizationService } from './NormalizationService';

class DataService {
  constructor() {
    this.baseDict = new BaseDict();
    this.connectionStatus = {
      firebase: false,
      server: false
    };
    this.translationCache = new Map();
    this.pendingBatchOperations = [];
    this.stats = {
      cacheHits: 0,
      firebaseHits: 0,
      serverHits: 0,
      fallbackHits: 0,
      totalRequests: 0
    };
    
    // Инициализация и проверка соединений
    this.initConnections();
  }

  /**
   * Инициализирует соединения и проверяет их доступность
   */
  async initConnections() {
    try {
      // Проверка Firebase
      this.connectionStatus.firebase = await this.checkFirebaseConnection();
      console.log(`Firebase connection: ${this.connectionStatus.firebase ? 'OK' : 'FAILED'}`);
      
      // Проверка сервера
      this.connectionStatus.server = await this.checkServerConnection();
      console.log(`Server connection: ${this.connectionStatus.server ? 'OK' : 'FAILED'}`);
    } catch (error) {
      console.error('Error initializing connections:', error);
    }
  }

  /**
   * Проверяет соединение с Firebase
   * @returns {Promise<boolean>} - true, если соединение активно
   */
  async checkFirebaseConnection() {
    try {
      const connectedRef = ref(database, '.info/connected');
      return new Promise((resolve) => {
        const unsubscribe = onValue(connectedRef, (snap) => {
          unsubscribe();
          resolve(snap.val() === true);
        }, (error) => {
          resolve(false);
        });
        
        // Таймаут для проверки соединения
        setTimeout(() => {
          unsubscribe();
          resolve(false);
        }, 3000);
      });
    } catch (error) {
      console.error('Error checking Firebase connection:', error);
      return false;
    }
  }

  /**
   * Проверяет соединение с сервером
   * @returns {Promise<boolean>} - true, если соединение активно
   */
  async checkServerConnection() {
    try {
      const response = await fetch('/api/health', { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000) // 3 секунды таймаут
      });
      return response.ok;
    } catch (error) {
      console.error('Error checking server connection:', error);
      return false;
    }
  }

  /**
   * Получает перевод слова с автоматическим выбором источника данных
   * @param {string} word - Слово для перевода
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<Object>} - Данные перевода
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

    // Шаг 3: Проверяем Firebase, если доступен
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
        // Пробуем найти перевод для нормализованной формы
        for (const normalizedForm of normalizationResult.normalizedForms) {
          if (normalizedForm !== normalizedWord) {
            const normalizedTranslation = await this.getTranslation(normalizedForm, { 
              skipNormalization: true, // Предотвращаем рекурсию
              originalWord: normalizedWord
            });
            
            if (normalizedTranslation) {
              // Добавляем информацию о нормализации
              const result = {
                ...normalizedTranslation,
                originalWord: normalizedWord,
                normalizedWord: normalizedForm,
                normalizationInfo: normalizationResult,
                usedNormalization: true
              };
              
              // Сохраняем результат в кэш для оригинального слова
              this.translationCache.set(normalizedWord, result);
              this.saveToLocalStorage(normalizedWord, result);
              
              return result;
            }
          }
        }
      }
    }

    // Шаг 5: Запрашиваем с сервера, если доступен
    if (this.connectionStatus.server) {
      try {
        const serverData = await this.fetchFromServer(normalizedWord);
        if (serverData) {
          this.stats.serverHits++;
          
          // Сохраняем в Firebase и localStorage
          if (this.connectionStatus.firebase) {
            this.saveToFirebase(normalizedWord, serverData);
          }
          this.saveToLocalStorage(normalizedWord, serverData);
          this.translationCache.set(normalizedWord, serverData);
          
          return {
            ...serverData,
            source: 'server'
          };
        }
      } catch (error) {
        console.error('Error fetching from server:', error);
      }
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
      error: 'Translation not found in any source'
    };
  }

  /**
   * Получает данные из локального хранилища
   * @param {string} word - Слово для получения
   * @returns {Object|null} - Данные перевода или null
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
   * Сохраняет данные в локальное хранилище
   * @param {string} word - Слово для сохранения
   * @param {Object} data - Данные перевода
   * @returns {boolean} - Результат операции
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
          return diffDays < 30; // Хранить не более 30 дней
        })
        .sort((a, b) => new Date(b[1].cachedAt) - new Date(a[1].cachedAt))
        .slice(0, 500); // Ограничиваем 500 словами
      
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
   * @param {string} word - Слово для получения
   * @returns {Promise<Object|null>} - Данные перевода или null
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
   * @param {string} word - Слово для сохранения
   * @param {Object} data - Данные перевода
   * @returns {Promise<boolean>} - Результат операции
   */
  async saveToFirebase(word, data) {
    try {
      const wordRef = ref(database, `dictionary/${word.toLowerCase()}`);
      await set(wordRef, {
        ...data,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      return false;
    }
  }

  /**
   * Получает данные с сервера
   * @param {string} word - Слово для получения
   * @returns {Promise<Object|null>} - Данные перевода или null
   */
  async fetchFromServer(word) {
    try {
      const response = await fetch(`/api/translate?word=${encodeURIComponent(word)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 секунд таймаут
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching from server:', error);
      return null;
    }
  }

  /**
   * Получает данные из базового словаря
   * @param {string} word - Слово для получения
   * @returns {Object|null} - Данные перевода или null
   */
  getFromBaseDict(word) {
    return this.baseDict.getTranslation(word);
  }

  /**
   * Добавляет операцию в пакетную очередь
   * @param {string} word - Слово для обработки
   * @returns {Promise<void>}
   */
  async addToBatch(word) {
    this.pendingBatchOperations.push(word);
    
    // Если набралось достаточно слов, запускаем обработку
    if (this.pendingBatchOperations.length >= 5) {
      await this.processBatch();
    }
  }

  /**
   * Обрабатывает пакет слов
   * @returns {Promise<Object>} - Результаты обработки
   */
  async processBatch() {
    if (this.pendingBatchOperations.length === 0) {
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
        // Добавляем задержку между запросами
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const translation = await this.getTranslation(word);
        
        if (translation && !translation.error) {
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
            error: translation?.error || 'Unknown error'
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
   * Получает статистику использования источников данных
   * @returns {Object} - Статистика
   */
  getStats() {
    const total = this.stats.totalRequests || 1; // Избегаем деления на ноль
    
    return {
      ...this.stats,
      cacheHitRate: ((this.stats.cacheHits / total) * 100).toFixed(2) + '%',
      firebaseHitRate: ((this.stats.firebaseHits / total) * 100).toFixed(2) + '%',
      serverHitRate: ((this.stats.serverHits / total) * 100).toFixed(2) + '%',
      fallbackHitRate: ((this.stats.fallbackHits / total) * 100).toFixed(2) + '%',
      cacheSize: this.translationCache.size,
      connectionStatus: this.connectionStatus
    };
  }

  /**
   * Очищает кэш переводов
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
   * Синхронизирует данные между источниками
   * @returns {Promise<Object>} - Результаты синхронизации
   */
  async syncData() {
    const results = {
      localToFirebase: 0,
      firebaseToLocal: 0,
      errors: []
    };
    
    // Синхронизация из localStorage в Firebase
    if (this.connectionStatus.firebase) {
      try {
        const cacheKey = 'flashcards_seznam_cache';
        const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        
        for (const [word, data] of Object.entries(cache)) {
          try {
            await this.saveToFirebase(word, data);
            results.localToFirebase++;
          } catch (error) {
            results.errors.push({
              word,
              operation: 'localToFirebase',
              error: error.message
            });
          }
        }
      } catch (error) {
        results.errors.push({
          operation: 'localToFirebase',
          error: error.message
        });
      }
    }
    
    return results;
  }
}

// Создаем и экспортируем экземпляр сервиса
const dataService = new DataService();

export { dataService, DataService };
