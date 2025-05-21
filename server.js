// server.js - Сервер на Express.js для доступа к Glosbe

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Включаем CORS для доступа с фронтенда
app.use(cors());

// Middleware для парсинга JSON
app.use(express.json());

// Папка с HTML-файлами
const parsedWordsFolder = path.join(__dirname, 'parsed_glosbe_words');

// Проверяем, существует ли папка, и создаем, если нет
if (!fs.existsSync(parsedWordsFolder)) {
  fs.mkdirSync(parsedWordsFolder, { recursive: true });
}

// Обслуживание статических файлов из папки build (после сборки React-приложения)
app.use(express.static(path.join(__dirname, '../build')));

// Обслуживание статических файлов из папки с HTML-файлами
app.use('/parsed_glosbe_words', express.static(parsedWordsFolder));

// API для поиска файлов по маске
app.get('/api/find-files', (req, res) => {
  const pattern = req.query.pattern;
  
  if (!pattern) {
    return res.status(400).json({ error: 'Не указан шаблон поиска' });
  }
  
  try {
    // Используем glob для поиска файлов по маске
    const files = glob.sync(pattern);
    return res.json(files);
  } catch (error) {
    console.error('Ошибка при поиске файлов:', error);
    return res.status(500).json({ error: 'Ошибка при поиске файлов' });
  }
});

// API для удаления файла
app.delete('/api/delete-file', (req, res) => {
  const filePath = req.query.path;
  
  if (!filePath) {
    return res.status(400).json({ error: 'Не указан путь к файлу' });
  }
  
  try {
    // Проверяем, что файл существует и находится в разрешенной папке
    const normalizedPath = path.normalize(filePath);
    const parsedWordsPath = path.normalize(parsedWordsFolder);
    
    if (!normalizedPath.startsWith(parsedWordsPath)) {
      return res.status(403).json({ error: 'Доступ к файлу запрещен' });
    }
    
    // Удаляем файл
    fs.unlinkSync(normalizedPath);
    return res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при удалении файла:', error);
    return res.status(500).json({ error: 'Ошибка при удалении файла' });
  }
});

// API эндпоинт для извлечения данных из локального HTML-файла
app.post('/api/parse-html', (req, res) => {
  try {
    const { filePath, word, from = 'cs', to = 'ru' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'Путь к файлу не указан' 
      });
    }
    
    // Проверяем, что файл существует и находится в разрешенной папке
    const fullPath = path.join(parsedWordsFolder, filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Файл не найден' 
      });
    }
    
    // Читаем HTML-файл
    const html = fs.readFileSync(fullPath, 'utf-8');
    
    // Парсим HTML
    const parsedData = parseGlosbeHTML(html, word || path.basename(filePath, '.htm'));
    
    // Приводим данные к формату, ожидаемому приложением
    const result = {
      word: parsedData.word,
      from_lang: from,
      to_lang: to,
      translations: parsedData.directTranslations.map(t => t.text),
      samples: parsedData.examples.slice(0, 3).map(e => ({
        phrase: e.original,
        translation: e.translated
      })),
      source: 'glosbe',
      timestamp: new Date().toISOString()
    };
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Ошибка при парсинге HTML-файла:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Ошибка при парсинге HTML-файла',
      message: error.message
    });
  }
});

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
    
    // Проверяем, есть ли уже сохраненный HTML-файл для этого слова
    const possibleFilePaths = [
      `${from}_${to}_${word}.htm`,
      `${from}_${to}_${word}_*.htm`
    ];
    
    let localFilePath = null;
    
    // Ищем подходящий файл
    for (const pattern of possibleFilePaths) {
      const files = glob.sync(path.join(parsedWordsFolder, pattern));
      if (files.length > 0) {
        localFilePath = files[0];
        break;
      }
    }
    
    if (localFilePath) {
      console.log(`Найден локальный HTML-файл для слова "${word}": ${localFilePath}`);
      
      // Читаем и парсим HTML-файл
      const html = fs.readFileSync(localFilePath, 'utf-8');
      const parsedData = parseGlosbeHTML(html, word);
      
      // Форматируем данные
      const result = {
        word: word,
        directTranslations: parsedData.directTranslations,
        examples: parsedData.examples,
        baseForms: parsedData.baseForms,
        similarPhrases: parsedData.similarPhrases,
        extractedTranslations: parsedData.extractedTranslations,
        fromLocalFile: true
      };
      
      return res.json({
        success: true,
        word,
        translations: result
      });
    }
    
    // Если локальный файл не найден, выполняем запрос к Glosbe
    console.log(`Локальный файл не найден, выполняем запрос к Glosbe для слова "${word}"`);
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
    
    // Сохраняем HTML в файл для будущего использования
    const timestamp = new Date().getTime();
    const fileName = `${from}_${to}_${word}_${timestamp}.htm`;
    const filePath = path.join(parsedWordsFolder, fileName);
    
    fs.writeFileSync(filePath, response.data, 'utf-8');
    console.log(`Сохранен HTML-файл: ${filePath}`);
    
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
            
            // Сохраняем HTML базовой формы
            const baseFormFileName = `${from}_${to}_${baseForm}_${timestamp}.htm`;
            const baseFormFilePath = path.join(parsedWordsFolder, baseFormFileName);
            fs.writeFileSync(baseFormFilePath, baseFormResponse.data, 'utf-8');
            console.log(`Сохранен HTML-файл базовой формы: ${baseFormFilePath}`);
            
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

// API для преобразования результатов парсинга в формат, ожидаемый приложением
app.get('/api/format-translations', (req, res) => {
  try {
    const { rawData } = req.query;
    
    if (!rawData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Данные для форматирования не указаны' 
      });
    }
    
    const parsedData = JSON.parse(rawData);
    
    // Преобразуем данные в формат, ожидаемый приложением
    const formattedData = {
      word: parsedData.word,
      translations: parsedData.directTranslations.map(t => t.text),
      samples: parsedData.examples.slice(0, 3).map(e => ({
        phrase: e.original,
        translation: e.translated
      })),
      source: 'glosbe',
      timestamp: new Date().toISOString()
    };
    
    return res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Ошибка при форматировании данных:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Ошибка при форматировании данных',
      message: error.message
    });
  }
});

// Маршрут для всех остальных запросов (для SPA маршрутизации)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`API доступен по адресу: http://localhost:${PORT}/api/translate`);
  console.log(`Папка с сохраненными HTML: ${parsedWordsFolder}`);
});

module.exports = app; // Для тестирования