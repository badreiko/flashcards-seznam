// api/translator.js

/**
 * Сервис для перевода текстов с использованием LibreTranslate API
 */

// Базовый URL публичного API LibreTranslate
// Можно выбрать любой из доступных публичных экземпляров
const API_URL = "https://translate.argosopentech.com/translate";

// Для некоторых API может потребоваться ключ
// const API_KEY = "ваш-api-ключ"; 

/**
 * Переводит текст с использованием LibreTranslate API
 * @param {string} text - Текст для перевода
 * @param {string} sourceLang - Исходный язык (cs для чешского, auto для автоопределения)
 * @param {string} targetLang - Целевой язык (ru для русского)
 * @returns {Promise<string>} - Промис с переведенным текстом
 */
export async function translateText(text, sourceLang = 'cs', targetLang = 'ru') {
  if (!text || text.trim() === '') {
    return '';
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        // api_key: API_KEY, // раскомментируйте, если API требует ключ
        format: "text"
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Translation error: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return data.translatedText;
  } catch (error) {
    console.error('Translation failed:', error);
    // Возвращаем исходный текст в случае ошибки
    return text;
  }
}

/**
 * Определяет язык текста с использованием LibreTranslate API
 * @param {string} text - Текст для определения языка
 * @returns {Promise<string>} - Промис с кодом обнаруженного языка
 */
export async function detectLanguage(text) {
  if (!text || text.trim() === '') {
    return null;
  }

  try {
    const response = await fetch("https://translate.argosopentech.com/detect", {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        // api_key: API_KEY, // раскомментируйте, если API требует ключ
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Language detection error: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    if (data && data.length > 0) {
      // Возвращаем код языка с наивысшей вероятностью
      return data[0].language;
    }
    return null;
  } catch (error) {
    console.error('Language detection failed:', error);
    return null;
  }
}

/**
 * Получает список поддерживаемых языков
 * @returns {Promise<Array>} - Промис со списком поддерживаемых языков
 */
export async function getSupportedLanguages() {
  try {
    const response = await fetch("https://translate.argosopentech.com/languages");
    
    if (!response.ok) {
      throw new Error(`Failed to get supported languages: ${response.statusText}`);
    }

    const languages = await response.json();
    return languages;
  } catch (error) {
    console.error('Failed to fetch supported languages:', error);
    return [];
  }
}
