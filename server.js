// server.js - Сервер на Express.js для доступа к Glosbe

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Включаем CORS для доступа с фронтенда
app.use(cors());

// Middleware для парсинга JSON
app.use(express.json());

// Обслуживание статических файлов из папки build (после сборки React-приложения)
app.use(express.static(path.join(__dirname, '../build')));

// API эндпоинт для перевода слов
app.get('/api/translate', async (req, res) => {
  try {
    const { word, from = 'cs', to = 'ru' } = req.query;
    
    if (!word) {
      return res.status(400).json({ 
        success: false, 
        error: 'Слово для перевода не указано' 
      });
    }
    
    // Выполняем запрос к Glosbe
    const translations = await fetchTranslationsFromGlosbe(word, from, to);
    
    return res.json({
      success: true,
      word,
      translations
    });
  } catch (error) {
    console.error('Ошибка при получении перевода:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Ошибка при получении перевода',
      message: error.message
    });
  }
});

// Функция для получения переводов с Glosbe
async function fetchTranslationsFromGlosbe(word, from, to) {
  try {
    // Формируем URL для запроса
    const url = `https://ru.glosbe.com/${from}/${to}/${encodeURIComponent(word)}`;
    
    // Выполняем HTTP-запрос с имитацией браузера
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    // Парсим HTML
    const translations = parseGlosbeHTML(response.data, word);
    
    // Проверяем, нужно ли выполнить запрос к базовой форме слова
    if (translations.baseForms && translations.baseForms.length > 0) {
      for (const baseForm of translations.baseForms) {
        if (baseForm !== word) { // Избегаем повторных запросов для того же слова
          console.log(`Найдена базовая форма: ${baseForm}, выполняем дополнительный запрос`);
          
          try {
            // Получаем переводы для базовой формы
            const baseFormUrl = `https://ru.glosbe.com/${from}/${to}/${encodeURIComponent(baseForm)}`;
            const baseFormResponse = await axios.get(baseFormUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
              }
            });
            
            // Парсим HTML базовой формы
            const baseFormTranslations = parseGlosbeHTML(baseFormResponse.data, baseForm);
            
            // Добавляем информацию, что это базовая форма
            baseFormTranslations.isBaseForm = true;
            
            // Объединяем результаты
            translations.relatedForms = translations.relatedForms || [];
            translations.relatedForms.push({
              word: baseForm,
              translations: baseFormTranslations
            });
          } catch (baseFormError) {
            console.error(`Ошибка при получении переводов для базовой формы ${baseForm}:`, baseFormError);
          }
        }
      }
    }
    
    return translations;
  } catch (error) {
    console.error('Ошибка при запросе к Glosbe:', error);
    throw error;
  }
}

// Функция для парсинга HTML-страницы Glosbe
function parseGlosbeHTML(html, originalWord) {
  try {
    const $ = cheerio.load(html);
    const result = {
      word: originalWord,
      directTranslations: [],
      examples: [],
      baseForms: [],
      similarPhrases: []
    };
    
    // 1. Проверяем, есть ли блок с предложением посмотреть другую форму слова
    $('.p-2 .rounded.border-l-4.border-blue-600.bg-blue-50').each(function() {
      $(this).find('a').each(function() {
        const baseForm = $(this).text().trim();
        if (baseForm && !result.baseForms.includes(baseForm)) {
          result.baseForms.push(baseForm);
        }
      });
    });
    
    // 2. Извлекаем прямые переводы
    $('.translation__item').each(function() {
      const translationText = $(this).find('.translation__item__pharse').text().trim();
      const partOfSpeech = $(this).find('.text-xxs.text-gray-500').text().trim();
      
      if (translationText) {
        const examples = [];
        
        // Извлекаем примеры для этого перевода
        $(this).find('.translation__example').each(function() {
          const originalText = $(this).find('[lang="cs"]').text().trim();
          const translatedText = $(this).find('.w-1/2.px-1.ml-2').text().trim();
          
          if (originalText && translatedText) {
            examples.push({
              original: originalText,
              translated: translatedText
            });
          }
        });
        
        result.directTranslations.push({
          text: translationText,
          partOfSpeech: partOfSpeech,
          examples: examples
        });
      }
    });
    
    // 3. Извлекаем менее частые переводы
    $('#less-frequent-translations-container-0 li').each(function() {
      const text = $(this).text().trim();
      if (text) {
        result.directTranslations.push({
          text: text,
          isLessFrequent: true
        });
      }
    });
    
    // 4. Извлекаем примеры использования (контекстные переводы)
    $('#tmem_first_examples .odd\\:bg-slate-100, #tmem_first_examples .px-1').each(function() {
      const originalText = $(this).find('.w-1/2.dir-aware-pr-1').text().trim();
      const translatedText = $(this).find('.w-1/2.dir-aware-pl-1').text().trim();
      const source = $(this).find('.text-xs.text-gray-500.leading-6').text().trim();
      
      if (originalText && translatedText) {
        // Ищем ключевое слово и его перевод (выделены в HTML классом "keyword")
        const keywordOriginal = $(this).find('.dir-aware-pr-1 .keyword').text().trim();
        const keywordTranslated = $(this).find('.dir-aware-pl-1 .keyword').text().trim();
        
        result.examples.push({
          original: originalText,
          translated: translatedText,
          keywordOriginal: keywordOriginal || originalWord,
          keywordTranslated: keywordTranslated || '',
          source: source
        });
      }
    });
    
    // 5. Извлекаем похожие фразы
    $('#simmilar-phrases li').each(function() {
      const phrase = $(this).find('.dir-aware-text-right a').text().trim();
      const translation = $(this).find('.dir-aware-pl-2').text().trim();
      
      if (phrase && translation) {
        result.similarPhrases.push({
          phrase: phrase,
          translation: translation
        });
      }
    });
    
    // Если прямых переводов нет, но есть примеры, извлекаем возможные переводы из примеров
    if (result.directTranslations.length === 0 && result.examples.length > 0) {
      const possibleTranslations = new Map();
      
      result.examples.forEach(example => {
        if (example.keywordTranslated) {
          // Используем Map для подсчета частоты переводов
          const count = possibleTranslations.get(example.keywordTranslated) || 0;
          possibleTranslations.set(example.keywordTranslated, count + 1);
        }
      });
      
      // Преобразуем Map в массив и сортируем по частоте
      const translationsArray = Array.from(possibleTranslations.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([text, count]) => ({
          text,
          frequency: count,
          extractedFromExamples: true
        }));
      
      result.extractedTranslations = translationsArray;
    }
    
    return result;
  } catch (error) {
    console.error('Ошибка при парсинге HTML:', error);
    return {
      word: originalWord,
      error: 'Ошибка при парсинге HTML',
      directTranslations: [],
      examples: []
    };
  }
}

// Маршрут для всех остальных запросов (для SPA маршрутизации)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`API доступен по адресу: http://localhost:${PORT}/api/translate`);
});

module.exports = app; // Для тестирования
