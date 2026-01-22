/**
 * DeepLService.js
 * Сервис для работы с DeepL API для высококачественных переводов
 *
 * API Documentation: https://developers.deepl.com/docs/api-reference
 */

class DeepLService {
  constructor() {
    // API ключ из переменных окружения
    this.apiKey = process.env.DEEPL_API_KEY;

    // Базовый URL для DeepL API (Free план)
    // Если у тебя PRO план, измени на: https://api.deepl.com/v2/translate
    this.apiUrl = 'https://api-free.deepl.com/v2/translate';

    // Статистика использования
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCharacters: 0
    };
  }

  /**
   * Перевести текст с чешского на русский
   * @param {string} text - Текст для перевода
   * @param {string} sourceLang - Исходный язык (по умолчанию 'CS' - чешский)
   * @param {string} targetLang - Целевой язык (по умолчанию 'RU' - русский)
   * @returns {Promise<Object>} - Результат перевода
   */
  async translateText(text, sourceLang = 'CS', targetLang = 'RU') {
    try {
      // Проверка API ключа
      if (!this.apiKey) {
        throw new Error('DeepL API key is not configured. Please set DEEPL_API_KEY in .env');
      }

      // Проверка входных данных
      if (!text || text.trim().length === 0) {
        throw new Error('Text to translate is empty');
      }

      this.stats.totalRequests++;
      this.stats.totalCharacters += text.length;

      console.log(`[DeepL] Translating: "${text.substring(0, 50)}..." (${text.length} chars)`);
      console.log(`[DeepL] Language: ${sourceLang} → ${targetLang}`);

      // Выполняем запрос к DeepL API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: [text],
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
          // Опции для улучшения качества
          formality: 'default', // или 'more', 'less' для формальности
          preserve_formatting: true
        })
      });

      // Проверка статуса ответа
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `DeepL API error: ${response.status} ${response.statusText}. ${errorData.message || ''}`
        );
      }

      const data = await response.json();

      // Извлекаем переводы
      if (!data.translations || data.translations.length === 0) {
        throw new Error('No translations returned from DeepL API');
      }

      this.stats.successfulRequests++;

      const result = {
        originalText: text,
        translatedText: data.translations[0].text,
        detectedSourceLang: data.translations[0].detected_source_language || sourceLang,
        targetLang: targetLang,
        source: 'deepl',
        charactersUsed: text.length,
        timestamp: new Date().toISOString()
      };

      console.log(`[DeepL] ✅ Translation successful: "${result.translatedText.substring(0, 50)}..."`);

      return result;

    } catch (error) {
      this.stats.failedRequests++;
      console.error(`[DeepL] ❌ Translation failed:`, error.message);

      return {
        error: true,
        message: error.message,
        originalText: text,
        source: 'deepl'
      };
    }
  }

  /**
   * Перевести слово с чешского на русский и вернуть массив переводов
   * (для совместимости с существующим API)
   * @param {string} word - Слово для перевода
   * @returns {Promise<Array<string>>} - Массив переводов
   */
  async translateWord(word) {
    try {
      const result = await this.translateText(word, 'CS', 'RU');

      if (result.error) {
        console.error('[DeepL] Error translating word:', result.message);
        return [];
      }

      // DeepL обычно возвращает один перевод
      // Для совместимости с текущим API возвращаем массив
      return [result.translatedText];

    } catch (error) {
      console.error('[DeepL] Error in translateWord:', error);
      return [];
    }
  }

  /**
   * Пакетный перевод нескольких текстов
   * @param {Array<string>} texts - Массив текстов для перевода
   * @param {string} sourceLang - Исходный язык
   * @param {string} targetLang - Целевой язык
   * @returns {Promise<Array<Object>>} - Массив результатов перевода
   */
  async translateBatch(texts, sourceLang = 'CS', targetLang = 'RU') {
    try {
      if (!this.apiKey) {
        throw new Error('DeepL API key is not configured');
      }

      if (!texts || texts.length === 0) {
        return [];
      }

      console.log(`[DeepL] Batch translating ${texts.length} texts`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: texts,
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
          preserve_formatting: true
        })
      });

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status}`);
      }

      const data = await response.json();

      // Формируем результаты
      const results = data.translations.map((translation, index) => ({
        originalText: texts[index],
        translatedText: translation.text,
        detectedSourceLang: translation.detected_source_language || sourceLang,
        source: 'deepl'
      }));

      console.log(`[DeepL] ✅ Batch translation successful: ${results.length} texts`);

      return results;

    } catch (error) {
      console.error('[DeepL] Batch translation failed:', error);
      return [];
    }
  }

  /**
   * Получить информацию об использовании API (лимиты)
   * @returns {Promise<Object>} - Информация об использовании
   */
  async getUsage() {
    try {
      if (!this.apiKey) {
        throw new Error('DeepL API key is not configured');
      }

      const usageUrl = this.apiUrl.replace('/translate', '/usage');

      const response = await fetch(usageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get usage info: ${response.status}`);
      }

      const data = await response.json();

      const usageInfo = {
        characterCount: data.character_count,
        characterLimit: data.character_limit,
        percentageUsed: ((data.character_count / data.character_limit) * 100).toFixed(2),
        charactersRemaining: data.character_limit - data.character_count
      };

      console.log(`[DeepL] Usage: ${usageInfo.characterCount}/${usageInfo.characterLimit} (${usageInfo.percentageUsed}%)`);

      return usageInfo;

    } catch (error) {
      console.error('[DeepL] Failed to get usage info:', error);
      return null;
    }
  }

  /**
   * Получить поддерживаемые языки
   * @returns {Promise<Array>} - Массив поддерживаемых языков
   */
  async getSupportedLanguages() {
    try {
      if (!this.apiKey) {
        throw new Error('DeepL API key is not configured');
      }

      const languagesUrl = this.apiUrl.replace('/translate', '/languages');

      const response = await fetch(languagesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get languages: ${response.status}`);
      }

      const languages = await response.json();
      console.log(`[DeepL] Supported languages:`, languages.map(l => l.language).join(', '));

      return languages;

    } catch (error) {
      console.error('[DeepL] Failed to get supported languages:', error);
      return [];
    }
  }

  /**
   * Получить статистику использования сервиса
   * @returns {Object} - Статистика
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      averageCharactersPerRequest: this.stats.totalRequests > 0
        ? Math.round(this.stats.totalCharacters / this.stats.totalRequests)
        : 0
    };
  }

  /**
   * Очистить статистику
   */
  clearStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCharacters: 0
    };
  }
}

// Создаем singleton экземпляр
const deepLService = new DeepLService();

module.exports = deepLService;
