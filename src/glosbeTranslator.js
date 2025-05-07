// glosbeTranslator.js - Функции для парсинга переводов с Glosbe и сохранения их в Firebase

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

// Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyAPZIHxaLt92McIvbIcYE-tSYp2Li2jxs4",
  authDomain: "flashcards-seznam-6652a.firebaseapp.com",
  projectId: "flashcards-seznam-6652a",
  storageBucket: "flashcards-seznam-6652a.firebasestorage.app",
  messagingSenderId: "99460986155",
  appId: "1:99460986155:web:e5ca466e3d07c20cde016e",
  measurementId: "G-ZFM0YW70ZD",
  // Явное указание URL базы данных
  databaseURL: "https://flashcards-seznam-6652a-default-rtdb.europe-west1.firebasedatabase.app"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Функции для локального кэширования переводов
 */
const localCache = {
  /**
   * Сохраняет данные в локальном хранилище
   * @param {string} word - Слово для сохранения
   * @param {Object} data - Данные перевода
   */
  save: function(word, data) {
    try {
      // Получаем существующий кэш или создаем новый
      const cacheKey = 'flashcards_seznam_cache';
      let cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      
      // Добавляем новые данные
      cache[word.toLowerCase()] = {
        ...data,
        cachedAt: new Date().toISOString()
      };
      
      // Ограничиваем размер кэша (30 дней или 500 слов)
      const now = new Date();
      const entries = Object.entries(cache);
      
      // Удаляем устаревшие записи и ограничиваем количество
      const filteredEntries = entries
        .filter(([_, entry]) => {
          const cachedAt = new Date(entry.cachedAt);
          const diffDays = (now - cachedAt) / (1000 * 60 * 60 * 24);
          return diffDays < 30; // Хранить не более 30 дней
        })
        .sort((a, b) => new Date(b[1].cachedAt) - new Date(a[1].cachedAt))
        .slice(0, 500); // Ограничиваем 500 словами
      
      // Создаем обновленный кэш
      const updatedCache = Object.fromEntries(filteredEntries);
      
      // Сохраняем в localStorage
      localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
      
      return true;
    } catch (error) {
      console.error('Ошибка при сохранении в локальный кэш:', error);
      return false;
    }
  },
  
  /**
   * Получает данные из локального хранилища
   * @param {string} word - Слово для получения
   * @returns {Object|null} - Данные перевода или null
   */
  get: function(word) {
    try {
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      return cache[word.toLowerCase()] || null;
    } catch (error) {
      console.error('Ошибка при получении из локального кэша:', error);
      return null;
    }
  },
  
  /**
   * Очищает локальный кэш
   */
  clear: function() {
    try {
      localStorage.removeItem('flashcards_seznam_cache');
      return true;
    } catch (error) {
      console.error('Ошибка при очистке локального кэша:', error);
      return false;
    }
  }
};

/**
 * Получает перевод слова с сайта Glosbe с расширенной обработкой ошибок
 * @param {string} word - Слово для перевода
 * @returns {Promise<Object>} - Объект с переводом и примерами
 */
export async function fetchTranslation(word) {
  if (!word) return null;
  
  // Кэш переводов для текущей сессии
  if (!window.translationsCache) {
    window.translationsCache = {};
  }
  
  // 1. Проверяем сессионный кэш
  if (window.translationsCache[word]) {
    console.log(`Используем кэшированный перевод для "${word}"`);
    return window.translationsCache[word];
  }
  
  // 2. Проверяем локальный кэш
  try {
    const localData = localCache.get(word);
    if (localData) {
      console.log(`Найден перевод в локальном кэше для "${word}"`);
      window.translationsCache[word] = localData;
      return localData;
    }
  } catch (localError) {
    console.warn('Ошибка при получении из локального кэша:', localError);
    // Продолжаем выполнение и пробуем получить из Firebase
  }
  
  // 3. Проверяем Firebase
  try {
    let cloudTranslation = await getFromCloudDictionary(word);
    if (cloudTranslation) {
      console.log(`Найден перевод в облачном словаре для "${word}"`);
      window.translationsCache[word] = cloudTranslation;
      // Сохраняем также в локальный кэш
      localCache.save(word, cloudTranslation);
      return cloudTranslation;
    }
  } catch (dbError) {
    console.warn('Ошибка при получении из Firebase:', dbError);
    // Продолжаем выполнение и пробуем получить из Glosbe
  }
  
  // 4. Получаем из Glosbe
  try {
    console.log(`Запрашиваем перевод для слова "${word}" из Glosbe`);
    
    // Различные CORS-прокси для надежности
    const corsProxies = [
      `https://corsproxy.io/?`,
      `https://cors-anywhere.herokuapp.com/`,
      `https://api.allorigins.win/raw?url=`,
      `https://proxy.cors.sh/`
    ];
    
    const url = `https://ru.glosbe.com/словарь-чешский-русский/${encodeURIComponent(word)}`;
    
    let html = null;
    let proxyUsed = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    // Пробуем получить HTML с разных прокси
    while (!html && retryCount < maxRetries) {
      for (const proxy of corsProxies) {
        try {
          const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/html',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            // Таймаут 8 секунд
            signal: AbortSignal.timeout(8000)
          });
          
          if (response.ok) {
            html = await response.text();
            proxyUsed = proxy;
            break;
          }
        } catch (proxyError) {
          console.warn(`Прокси ${proxy} недоступен:`, proxyError);
          // Пробуем следующий прокси
        }
      }
      
      retryCount++;
      if (!html && retryCount < maxRetries) {
        // Ждем перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!html) {
      throw new Error('Все прокси-серверы недоступны или не удалось получить HTML');
    }
    
    console.log(`Использован прокси: ${proxyUsed}`);
    
    // Парсинг HTML - используем несколько стратегий
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Проверяем, есть ли ошибки в документе
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
      throw new Error(`Ошибка при парсинге HTML: ${errorNode.textContent}`);
    }
    
    // СТРАТЕГИЯ 1: Извлечение переводов
    const translations = [];
    
    // Метод 1: Основные переводы
    const translationItems = doc.querySelectorAll('li.translation__item');
    translationItems.forEach(item => {
      const wordElement = item.querySelector('.translation__item__pharse');
      if (wordElement) {
        const text = wordElement.textContent.trim();
        if (text && !translations.includes(text)) {
          translations.push(text);
        }
      }
    });
    
    // Метод 2: Менее частые переводы
    if (translations.length === 0) {
      const containerSelectors = [
        '#less-frequent-translations-container-0',
        '#less-frequent-translations-container-1',
        '[id^="less-frequent-translations-container-"]'
      ];
      
      for (const selector of containerSelectors) {
        const containers = doc.querySelectorAll(selector);
        containers.forEach(container => {
          const items = container.querySelectorAll('li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text && !translations.includes(text)) {
              translations.push(text);
            }
          });
        });
        
        if (translations.length > 0) break;
      }
    }
    
    // Метод 3: Альтернативные селекторы для переводов
    if (translations.length === 0) {
      const altSelectors = [
        '.translation',
        '.translate-target',
        '.word-translation',
        '.pharse',
        '[data-translation]'
      ];
      
      for (const selector of altSelectors) {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(elem => {
          const text = elem.textContent.trim();
          if (text && text.length < 50 && !translations.includes(text)) {
            translations.push(text);
          }
        });
        
        if (translations.length > 0) break;
      }
    }
    
    // Метод 4: Поиск по всему документу для текстовых узлов со словами на кириллице
    if (translations.length === 0) {
      // Регулярное выражение для проверки наличия кириллицы
      const cyrillicRegex = /[а-яА-ЯёЁ]{3,}/;
      
      // Функция для рекурсивного обхода текстовых узлов
      function findCyrillicTextNodes(node, results = []) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text && cyrillicRegex.test(text) && text.length < 50) {
            results.push(text);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          for (const child of node.childNodes) {
            findCyrillicTextNodes(child, results);
          }
        }
        return results;
      }
      
      // Ищем в основном контейнере со словами
      const mainContainer = doc.querySelector('#dictionary-content, .translations-container, .main-content');
      if (mainContainer) {
        const cyrillicTexts = findCyrillicTextNodes(mainContainer);
        
        // Фильтруем тексты, которые похожи на словарные статьи
        cyrillicTexts
          .filter(text => text.length > 2 && text.length < 30)
          .forEach(text => {
            if (!translations.includes(text)) {
              translations.push(text);
            }
          });
      }
    }
    
    // СТРАТЕГИЯ 2: Извлечение примеров использования
    const samples = [];
    
    // Метод 1: Основные примеры
    const exampleItems = doc.querySelectorAll('.translation__example');
    exampleItems.forEach(example => {
      const sourceSelectors = ['[lang="cs"]', '.source-text', '.original-text'];
      const targetSelectors = ['.w-1/2.px-1.ml-2', '.target-text', '.translation-text'];
      
      let sourceText = null;
      let targetText = null;
      
      for (const selector of sourceSelectors) {
        const element = example.querySelector(selector);
        if (element) {
          sourceText = element.textContent.trim();
          break;
        }
      }
      
      for (const selector of targetSelectors) {
        const element = example.querySelector(selector);
        if (element) {
          targetText = element.textContent.trim();
          break;
        }
      }
      
      if (sourceText && targetText) {
        samples.push({
          phrase: sourceText,
          translation: targetText
        });
      }
    });
    
    // Метод 2: TM примеры
    if (samples.length === 0) {
      const tmContainerSelectors = [
        '#tmem_first_examples',
        '#tmem_examples',
        '.tm-examples'
      ];
      
      for (const containerSelector of tmContainerSelectors) {
        const container = doc.querySelector(containerSelector);
        if (container) {
          const rowSelectors = ['.odd\\:bg-slate-100', '.example-row', 'tr'];
          const rows = container.querySelectorAll(rowSelectors.join(', '));
          
          rows.forEach(row => {
            const sourceSelectors = ['.w-1/2.dir-aware-pr-1', '.source', '[lang="cs"]'];
            const targetSelectors = ['.w-1/2.dir-aware-pl-1', '.target', '[lang="ru"]'];
            
            let sourceText = null;
            let targetText = null;
            
            for (const selector of sourceSelectors) {
              const element = row.querySelector(selector);
              if (element) {
                sourceText = element.textContent.trim();
                break;
              }
            }
            
            for (const selector of targetSelectors) {
              const element = row.querySelector(selector);
              if (element) {
                targetText = element.textContent.trim();
                break;
              }
            }
            
            if (sourceText && targetText) {
              // Проверяем, что пример содержит искомое слово
              if (sourceText.toLowerCase().includes(word.toLowerCase())) {
                samples.push({
                  phrase: sourceText,
                  translation: targetText
                });
              }
            }
          });
        }
        
        if (samples.length > 0) break;
      }
    }
    
    // Метод 3: Поиск таблиц с примерами
    if (samples.length === 0) {
      const tables = doc.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const sourceText = cells[0].textContent.trim();
            const targetText = cells[1].textContent.trim();
            
            if (sourceText && targetText && sourceText.toLowerCase().includes(word.toLowerCase())) {
              samples.push({
                phrase: sourceText,
                translation: targetText
              });
            }
          }
        });
      });
    }
    
    // Формируем результат
    const result = {
      word: word,
      translations: translations.length > 0 ? translations : [],
      samples: samples.length > 0 ? samples.slice(0, 3) : [], // Ограничиваем количество примеров
      source: 'glosbe',
      timestamp: new Date().toISOString(),
      proxyUsed: proxyUsed
    };
    
    // Сохраняем в сессионный кэш
    window.translationsCache[word] = result;
    
    // Сохраняем в локальный кэш
    localCache.save(word, result);
    
    // Сохраняем в Firebase
    try {
      await saveToCloudDictionary(result);
    } catch (saveError) {
      console.warn('Ошибка при сохранении в Firebase:', saveError);
      // Продолжаем выполнение, т.к. данные уже получены и сохранены локально
    }
    
    return result;
  } catch (error) {
    console.error(`Ошибка при получении перевода для "${word}":`, error);
    
    // Помечаем ошибку в кэше для предотвращения повторных запросов
    const fallbackResult = {
      word: word,
      translations: [],
      samples: [],
      note: "Не удалось получить перевод. Возможно, слово отсутствует в словаре или возникла проблема с подключением.",
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    // Сохраняем в сессионный кэш с меткой ошибки
    window.translationsCache[word] = fallbackResult;
    
    return fallbackResult;
  }
}

/**
 * Сохраняет перевод в Firebase
 * @param {Object} wordData - Данные о слове для сохранения
 * @returns {Promise<boolean>} - Результат операции
 */
export async function saveToCloudDictionary(wordData) {
  try {
    // Используем нормализованное слово в качестве ключа
    const wordKey = wordData.word.toLowerCase();
    
    // Проверим, есть ли уже это слово в словаре
    try {
      const existingData = await getFromCloudDictionary(wordKey);
      
      if (existingData) {
        // Объединяем существующие данные с новыми
        
        // Объединяем переводы без дубликатов
        const allTranslations = [...new Set([
          ...(existingData.translations || []),
          ...(wordData.translations || [])
        ])];
        
        // Объединяем примеры без дубликатов
        const samplesMap = {};
        
        // Добавляем существующие примеры
        (existingData.samples || []).forEach(sample => {
          const key = `${sample.phrase}|${sample.translation}`;
          samplesMap[key] = sample;
        });
        
        // Добавляем новые примеры
        (wordData.samples || []).forEach(sample => {
          const key = `${sample.phrase}|${sample.translation}`;
          samplesMap[key] = sample;
        });
        
        const allSamples = Object.values(samplesMap);
        
        // Создаем обновленные данные
        const updatedData = {
          ...existingData,
          translations: allTranslations,
          samples: allSamples,
          lastUpdated: new Date().toISOString()
        };
        
        // Сохраняем обновленные данные
        await set(ref(database, `dictionary/${wordKey}`), updatedData);
      } else {
        // Добавляем новое слово
        await set(ref(database, `dictionary/${wordKey}`), {
          ...wordData,
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (existingDataError) {
      // Если не удалось получить существующие данные, пробуем добавить новые
      await set(ref(database, `dictionary/${wordKey}`), {
        ...wordData,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }
    
    console.log(`Слово "${wordData.word}" сохранено в облачном словаре`);
    return true;
  } catch (error) {
    console.error('Ошибка при сохранении в облачный словарь:', error);
    // Пробуем повторить запрос один раз
    try {
      const wordKey = wordData.word.toLowerCase();
      await set(ref(database, `dictionary/${wordKey}`), {
        ...wordData,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        retried: true
      });
      console.log(`Слово "${wordData.word}" сохранено в облачном словаре после повторной попытки`);
      return true;
    } catch (retryError) {
      console.error('Ошибка при повторном сохранении в облачный словарь:', retryError);
      return false;
    }
  }
}

/**
 * Получает перевод слова из Firebase
 * @param {string} word - Слово для получения
 * @returns {Promise<Object|null>} - Данные о слове или null, если слово не найдено
 */
export async function getFromCloudDictionary(word) {
  if (!word) return null;
  
  try {
    const wordKey = word.toLowerCase();
    const snapshot = await get(ref(database, `dictionary/${wordKey}`));
    
    if (snapshot.exists()) {
      console.log(`Слово "${word}" найдено в облачном словаре`);
      return snapshot.val();
    } else {
      console.log(`Слово "${word}" не найдено в облачном словаре`);
      return null;
    }
  } catch (error) {
    console.error('Ошибка при получении из облачного словаря:', error);
    
    // Пробуем повторить запрос с таймаутом
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const wordKey = word.toLowerCase();
      const snapshot = await get(ref(database, `dictionary/${wordKey}`));
      
      if (snapshot.exists()) {
        console.log(`Слово "${word}" найдено в облачном словаре после повторной попытки`);
        return snapshot.val();
      } else {
        return null;
      }
    } catch (retryError) {
      console.error('Ошибка при повторном получении из облачного словаря:', retryError);
      return null;
    }
  }
}

/**
 * Получает все слова из словаря
 * @returns {Promise<Array>} - Массив слов
 */
export async function getEntireDictionary() {
  try {
    const snapshot = await get(ref(database, 'dictionary'));
    
    if (snapshot.exists()) {
      // Преобразуем объект в массив для удобства
      const dictionary = snapshot.val();
      return Object.values(dictionary);
    } else {
      console.log('Словарь пуст');
      return [];
    }
  } catch (error) {
    console.error('Ошибка при получении словаря:', error);
    
    // Пробуем получить словарь частями
    try {
      // Получаем только первые буквы ключей
      const firstLettersSnapshot = await get(ref(database, 'dictionary'));
      if (!firstLettersSnapshot.exists()) return [];
      
      const result = [];
      const entries = Object.entries(firstLettersSnapshot.val());
      
      // Обрабатываем каждый ключ отдельно
      for (const [key, value] of entries) {
        try {
          if (typeof value === 'object') {
            result.push(value);
          }
        } catch (entryError) {
          console.warn(`Ошибка при получении записи ${key}:`, entryError);
        }
      }
      
      return result;
    } catch (retryError) {
      console.error('Ошибка при повторном получении словаря:', retryError);
      // В худшем случае возвращаем пустой массив
      return [];
    }
  }
}

/**
 * Экспортирует словарь в JSON-файл
 * @param {Array} dictionary - Словарь для экспорта
 */
export function exportDictionaryToJson(dictionary) {
  try {
    const dataStr = JSON.stringify(dictionary, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'czech_dictionary.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    return true;
  } catch (error) {
    console.error('Ошибка при экспорте словаря в JSON:', error);
    
    // Пробуем разбить большой словарь на части
    try {
      const chunks = [];
      const chunkSize = 100; // Слов в одном файле
      
      for (let i = 0; i < dictionary.length; i += chunkSize) {
        chunks.push(dictionary.slice(i, i + chunkSize));
      }
      
      // Скачиваем каждую часть отдельно
      chunks.forEach((chunk, index) => {
        const chunkStr = JSON.stringify(chunk, null, 2);
        const chunkUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(chunkStr);
        
        const filename = `czech_dictionary_part${index + 1}.json`;
        
        const link = document.createElement('a');
        link.setAttribute('href', chunkUri);
        link.setAttribute('download', filename);
        // Задержка для предотвращения блокировки загрузок
        setTimeout(() => link.click(), index * 1000);
      });
      
      return true;
    } catch (retryError) {
      console.error('Ошибка при экспорте частей словаря:', retryError);
      return false;
    }
  }
}

/**
 * Импортирует словарь из JSON-файла
 * @param {File} file - JSON-файл со словарем
 * @returns {Promise<number>} - Количество импортированных слов
 */
export async function importDictionaryFromJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const dictionary = JSON.parse(event.target.result);
        
        if (!Array.isArray(dictionary)) {
          reject(new Error('Неверный формат файла. Ожидается массив слов.'));
          return;
        }
        
        let importedCount = 0;
        let errorCount = 0;
        
        // Сохраняем каждое слово в Firebase
        for (const wordData of dictionary) {
          if (wordData && wordData.word) {
            try {
              await saveToCloudDictionary(wordData);
              importedCount++;
              
              // Сохраняем также в локальный кэш
              localCache.save(wordData.word, wordData);
            } catch (saveError) {
              console.warn(`Ошибка при сохранении слова "${wordData.word}":`, saveError);
              errorCount++;
            }
          }
        }
        
        if (errorCount > 0) {
          console.warn(`Импорт завершен, но с ошибками. Успешно: ${importedCount}, с ошибками: ${errorCount}`);
        }
        
        resolve(importedCount);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Ошибка при чтении файла'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Поиск слов в словаре по образцу
 * @param {string} pattern - Образец для поиска
 * @returns {Promise<Array>} - Массив найденных слов
 */
export async function searchInDictionary(pattern) {
  if (!pattern) return [];
  
  try {
    // Сначала попробуем найти в локальном кэше
    let results = [];
    try {
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      const localResults = Object.values(cache).filter(item => 
        item.word.toLowerCase().includes(pattern.toLowerCase()) || 
        item.translations.some(t => t.toLowerCase().includes(pattern.toLowerCase()))
      );
      results = [...localResults];
    } catch (cacheError) {
      console.warn('Ошибка при поиске в локальном кэше:', cacheError);
    }
    
    // Затем поищем в Firebase
    try {
      const allWords = await getEntireDictionary();
      const cloudResults = allWords.filter(item => 
        item.word.toLowerCase().includes(pattern.toLowerCase()) || 
        item.translations.some(t => t.toLowerCase().includes(pattern.toLowerCase()))
      );
      
      // Объединяем результаты без дубликатов
      const wordMap = {};
      
      // Сначала добавляем результаты из локального кэша
      results.forEach(item => {
        wordMap[item.word.toLowerCase()] = item;
      });
      
      // Затем добавляем или обновляем из Firebase
      cloudResults.forEach(item => {
        wordMap[item.word.toLowerCase()] = item;
      });
      
      // Преобразуем в массив и сортируем
      return Object.values(wordMap).sort((a, b) => a.word.localeCompare(b.word));
    } catch (firebaseError) {
      console.warn('Ошибка при поиске в Firebase:', firebaseError);
      // Возвращаем результаты только из локального кэша
      return results;
    }
  } catch (error) {
    console.error('Ошибка при поиске в словаре:', error);
    return [];
  }
}

/**
 * Проверяет состояние соединения с Firebase
 * @returns {Promise<boolean>} - true, если соединение активно
 */
export async function checkFirebaseConnection() {
  try {
    // Пытаемся получить тестовую запись
    const testRef = ref(database, '.info/connected');
    const snapshot = await get(testRef);
    
    return snapshot.exists() && snapshot.val() === true;
  } catch (error) {
    console.error('Ошибка при проверке соединения с Firebase:', error);
    return false;
  }
}

/**
 * Очищает кэш переводов (и локальный, и сессионный)
 */
export function clearTranslationsCache() {
  try {
    // Очищаем сессионный кэш
    window.translationsCache = {};
    
    // Очищаем локальный кэш
    localCache.clear();
    
    return true;
  } catch (error) {
    console.error('Ошибка при очистке кэша переводов:', error);
    return false;
  }
}

/**
 * Получает статистику словаря
 * @returns {Promise<Object>} - Статистика словаря
 */
export async function getDictionaryStats() {
  try {
    // Статистика из Firebase
    let cloudSize = 0;
    let mostCommonTranslations = [];
    
    try {
      const allWords = await getEntireDictionary();
      cloudSize = allWords.length;
      
      // Подсчитываем наиболее часто встречающиеся переводы
      const translationCounts = {};
      
      allWords.forEach(word => {
        (word.translations || []).forEach(translation => {
          translationCounts[translation] = (translationCounts[translation] || 0) + 1;
        });
      });
      
      // Сортируем по частоте
      mostCommonTranslations = Object.entries(translationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([translation, count]) => ({ translation, count }));
    } catch (cloudError) {
      console.warn('Ошибка при получении статистики из Firebase:', cloudError);
    }
    
    // Статистика из локального кэша
    let localSize = 0;
    
    try {
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      localSize = Object.keys(cache).length;
    } catch (localError) {
      console.warn('Ошибка при получении статистики из локального кэша:', localError);
    }
    
    return {
      cloudSize,
      localSize,
      mostCommonTranslations,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Ошибка при получении статистики словаря:', error);
    return {
      cloudSize: 0,
      localSize: 0,
      mostCommonTranslations: [],
      error: error.message,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Экспортирует локальный кэш в Firebase
 * Полезно для синхронизации локально сохраненных слов
 * @returns {Promise<Object>} - Результат операции
 */
export async function syncLocalCacheToFirebase() {
  try {
    const cacheKey = 'flashcards_seznam_cache';
    const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    
    const words = Object.values(cache);
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const word of words) {
      try {
        await saveToCloudDictionary(word);
        syncedCount++;
      } catch (saveError) {
        console.warn(`Ошибка при синхронизации слова "${word.word}":`, saveError);
        errorCount++;
      }
      
      // Добавляем небольшую задержку для предотвращения перегрузки Firebase
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return {
      totalWords: words.length,
      syncedCount,
      errorCount,
      success: errorCount === 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Ошибка при синхронизации локального кэша с Firebase:', error);
    return {
      totalWords: 0,
      syncedCount: 0,
      errorCount: 1,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Экспортируем локальное хранилище для использования в других местах
export { localCache };