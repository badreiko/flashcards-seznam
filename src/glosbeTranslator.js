// glosbeTranslator.js - Функции для парсинга переводов с Glosbe и сохранения их в Firebase

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, child, push } from 'firebase/database';

// Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyAPZIHxaLt92McIvbIcYE-tSYp2Li2jxs4",
  authDomain: "flashcards-seznam-6652a.firebaseapp.com",
  projectId: "flashcards-seznam-6652a",
  storageBucket: "flashcards-seznam-6652a.firebasestorage.app",
  messagingSenderId: "99460986155",
  appId: "1:99460986155:web:e5ca466e3d07c20cde016e",
  measurementId: "G-ZFM0YW70ZD"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Получает перевод слова с сайта Glosbe
 * @param {string} word - Слово для перевода
 * @returns {Promise<Object>} - Объект с переводом и примерами
 */
export async function fetchTranslation(word) {
  if (!word) return null;
  
  // Кэш переводов для ускорения работы и снижения нагрузки на сервер
  if (!window.translationsCache) {
    window.translationsCache = {};
  }
  
  // Если перевод уже в кэше, возвращаем его
  if (window.translationsCache[word]) {
    console.log(`Используем кэшированный перевод для "${word}"`);
    return window.translationsCache[word];
  }
  
  // Проверяем перевод в Firebase
  let cloudTranslation = await getFromCloudDictionary(word);
  if (cloudTranslation) {
    console.log(`Найден перевод в облачном словаре для "${word}"`);
    window.translationsCache[word] = cloudTranslation;
    return cloudTranslation;
  }
  
  try {
    console.log(`Запрашиваем перевод для слова "${word}" из Glosbe`);
    
    // Создаем URL для запроса
    const url = `https://ru.glosbe.com/словарь-чешский-русский/${encodeURIComponent(word)}`;
    
    // Используем прокси, чтобы обойти ограничения CORS
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    // Запрашиваем HTML-страницу словаря
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Ошибка запроса: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Создаем DOM-дерево для парсинга
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Извлекаем основные переводы
    const translations = [];
    const translationItems = doc.querySelectorAll('li.translation__item');
    
    translationItems.forEach(item => {
      const wordElement = item.querySelector('.translation__item__pharse');
      if (wordElement) {
        translations.push(wordElement.textContent.trim());
      }
    });
    
    // Если основных переводов нет, ищем менее частые
    if (translations.length === 0) {
      const lessFrequentItems = doc.querySelectorAll('#less-frequent-translations-container-0 ul li');
      lessFrequentItems.forEach(item => {
        const text = item.textContent.trim();
        if (text) translations.push(text);
      });
    }
    
    // Извлекаем примеры использования
    const samples = [];
    const exampleItems = doc.querySelectorAll('.translation__example');
    
    exampleItems.forEach(example => {
      const csText = example.querySelector('[lang="cs"]');
      const ruText = example.querySelector('.w-1/2.px-1.ml-2');
      
      if (csText && ruText) {
        samples.push({
          phrase: csText.textContent.trim(),
          translation: ruText.textContent.trim()
        });
      }
    });
    
    // Если не нашли примеры в первом блоке, ищем в блоке TM
    if (samples.length === 0) {
      const tmExamples = doc.querySelectorAll('#tmem_first_examples .odd\\:bg-slate-100');
      tmExamples.forEach(example => {
        const csText = example.querySelector('.w-1/2.dir-aware-pr-1');
        const ruText = example.querySelector('.w-1/2.dir-aware-pl-1');
        
        if (csText && ruText) {
          samples.push({
            phrase: csText.textContent.trim(),
            translation: ruText.textContent.trim()
          });
        }
      });
    }
    
    // Формируем результат
    const result = {
      word: word,
      translations: translations.length > 0 ? translations : [],
      samples: samples.length > 0 ? samples.slice(0, 3) : [], // Ограничиваем количество примеров
      source: 'glosbe',
      timestamp: new Date().toISOString()
    };
    
    // Сохраняем в кэш
    window.translationsCache[word] = result;
    
    // Сохраняем в Firebase
    await saveToCloudDictionary(result);
    
    return result;
  } catch (error) {
    console.error(`Ошибка при получении перевода для "${word}":`, error);
    
    // Если не удалось получить перевод, возвращаем объект с исходным словом
    const fallbackResult = {
      word: word,
      translations: [],
      samples: [],
      note: "Не удалось получить перевод. Возможно, слово отсутствует в словаре или возникла проблема с подключением."
    };
    
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
    
    console.log(`Слово "${wordData.word}" сохранено в облачном словаре`);
    return true;
  } catch (error) {
    console.error('Ошибка при сохранении в облачный словарь:', error);
    return false;
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
    return null;
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
    return [];
  }
}

/**
 * Экспортирует словарь в JSON-файл
 * @param {Array} dictionary - Словарь для экспорта
 */
export function exportDictionaryToJson(dictionary) {
  const dataStr = JSON.stringify(dictionary, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'czech_dictionary.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
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
        
        // Сохраняем каждое слово в Firebase
        for (const wordData of dictionary) {
          if (wordData && wordData.word) {
            await saveToCloudDictionary(wordData);
            importedCount++;
          }
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
    const allWords = await getEntireDictionary();
    return allWords.filter(item => 
      item.word.includes(pattern.toLowerCase()) || 
      item.translations.some(t => t.toLowerCase().includes(pattern.toLowerCase()))
    );
  } catch (error) {
    console.error('Ошибка при поиске в словаре:', error);
    return [];
  }
}