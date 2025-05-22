// glosbeClient.js - Клиент для взаимодействия с API сервера

/**
 * Базовый URL для API сервера
 * В разработке используем локальный сервер, в продакшене можно заменить на фактический адрес вашего сервера
 */
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://flashcards-seznam.railway.internal/api'
  : 'http://localhost:3001/api';

/**
 * Получает перевод слова через серверное API
 * @param {string} word - Слово для перевода
 * @param {string} from - Исходный язык (по умолчанию 'cs' - чешский)
 * @param {string} to - Целевой язык (по умолчанию 'ru' - русский)
 * @returns {Promise<Object>} - Объект с переводами и примерами
 */
export async function fetchTranslation(word) {
  if (!word) return null;
  
  // Язык по умолчанию - чешско-русский словарь
  const from = 'cs';
  const to = 'ru';
  
  try {
    // Кэш переводов для текущей сессии
    if (!window.translationsCache) {
      window.translationsCache = {};
    }
    
    // Проверяем кэш перед запросом к серверу
    if (window.translationsCache[word]) {
      console.log(`Используем кэшированный перевод для "${word}"`);
      return window.translationsCache[word];
    }
    
    // Формируем URL для запроса
    const url = `${API_BASE_URL}/translate?word=${encodeURIComponent(word)}&from=${from}&to=${to}`;
    
    console.log(`Запрашиваем перевод для слова "${word}" через API-сервер`);
    
    // Выполняем запрос к серверу
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Ошибка при получении перевода: ${response.status} ${response.statusText}`);
    }
    
    // Парсим ответ
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Неизвестная ошибка при получении перевода');
    }
    
    // Форматируем результат для использования в приложении
    const result = formatTranslationResult(data.translations, word);
    
    // Сохраняем в кэш
    window.translationsCache[word] = result;
    
    return result;
  } catch (error) {
    console.error(`Ошибка при получении перевода для "${word}":`, error);
    
    // В случае ошибки возвращаем объект с информацией об ошибке
    return {
      word: word,
      translations: [],
      samples: [],
      note: `Не удалось получить перевод: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Форматирует результат запроса в удобный для приложения вид
 * @param {Object} translationsData - Данные, полученные от сервера
 * @param {string} originalWord - Исходное слово
 * @returns {Object} - Форматированный результат
 */
function formatTranslationResult(translationsData, originalWord) {
  // Если данные отсутствуют, возвращаем пустой результат
  if (!translationsData) {
    return {
      word: originalWord,
      translations: [],
      samples: [],
      error: 'Нет данных перевода'
    };
  }
  
  // Массив переводов для возврата
  const translations = [];
  
  // Добавляем прямые переводы
  if (translationsData.directTranslations && translationsData.directTranslations.length > 0) {
    translationsData.directTranslations.forEach(item => {
      translations.push({
        text: item.text,
        partOfSpeech: item.partOfSpeech || '',
        isLessFrequent: item.isLessFrequent || false
      });
    });
  }
  
  // Добавляем извлеченные из примеров переводы, если нет прямых
  if (translations.length === 0 && translationsData.extractedTranslations && translationsData.extractedTranslations.length > 0) {
    translationsData.extractedTranslations.forEach(item => {
      translations.push({
        text: item.text,
        frequency: item.frequency,
        extractedFromExamples: true
      });
    });
  }
  
  // Форматируем примеры
  const samples = (translationsData.examples || []).map(example => ({
    phrase: example.original,
    translation: example.translated,
    keywordOriginal: example.keywordOriginal,
    keywordTranslated: example.keywordTranslated,
    source: example.source
  }));
  
  // Форматируем базовые формы
  const baseForms = translationsData.baseForms || [];
  
  // Форматируем связанные формы (если есть)
  const relatedForms = (translationsData.relatedForms || []).map(form => ({
    word: form.word,
    translations: form.translations ? form.translations.directTranslations.map(t => t.text) : []
  }));
  
  // Форматируем похожие фразы
  const similarPhrases = translationsData.similarPhrases || [];
  
  // Создаем результат
  return {
    word: originalWord,
    translations: translations,
    samples: samples,
    baseForms: baseForms,
    relatedForms: relatedForms,
    similarPhrases: similarPhrases,
    source: 'glosbe',
    timestamp: new Date().toISOString()
  };
}

/**
 * Извлекает уникальные слова из текста
 * @param {string} text - Исходный текст
 * @returns {Array<string>} - Массив уникальных слов
 */
export function extractUniqueWords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  try {
    // Приводим к нижнему регистру
    const lowerCaseText = text.toLowerCase();
    
    // Удаляем символы пунктуации и заменяем их пробелами
    // Расширенный список символов пунктуации, включая чешские кавычки
    const cleanedText = lowerCaseText.replace(/[.,/#!$%^&*;:{}=\-_`~()«»„""''\[\]]/g, ' ');
    
    // Разбиваем на слова и убираем лишние пробелы
    const words = cleanedText
      .split(/\s+/)
      .filter(word => word.length > 1); // Исключаем односимвольные слова
    
    // Создаем множество (Set) для исключения дубликатов
    const uniqueWordsSet = new Set(words);
    
    // Преобразуем множество обратно в массив и сортируем
    return Array.from(uniqueWordsSet).sort();
  } catch (error) {
    console.error('Ошибка при извлечении уникальных слов:', error);
    return [];
  }
}

/**
 * Проверяет доступность API сервера
 * @returns {Promise<boolean>} - true, если сервер доступен
 */
export async function checkServerAvailability() {
  try {
    // Пробуем сделать простой запрос к серверу
    const response = await fetch(`${API_BASE_URL}/translate?word=test`);
    return response.ok;
  } catch (error) {
    console.error('Ошибка при проверке доступности сервера:', error);
    return false;
  }
}

// Экспортируем функции для использования в приложении
export default {
  fetchTranslation,
  extractUniqueWords,
  checkServerAvailability
};
