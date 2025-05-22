// server.js - Обновленный сервер с парсингом Glosbe для Flashcards Seznam
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Включаем CORS для доступа с фронтенда
app.use(cors());
app.use(express.json());

// Папка с HTML-файлами (как в вашем оригинальном коде)
const parsedWordsFolder = path.join(__dirname, 'parsed_glosbe_words');
if (!fs.existsSync(parsedWordsFolder)) {
  fs.mkdirSync(parsedWordsFolder, { recursive: true });
}

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'build')));

// Новый класс для парсинга Glosbe (аналог вашего Python кода)
class GlosbeParser {
  constructor() {
    this.requestDelay = 1000; // Задержка между запросами
    this.lastRequestTime = 0;
  }

  async parseWord(word, fromLang = 'cs', toLang = 'ru') {
    try {
      // Добавляем задержку между запросами
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.requestDelay) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      console.log(`[${new Date().toLocaleTimeString()}] Парсим слово: "${word}"`);
      
      // Формируем URL точно как в вашем Python коде
      const encodedWord = encodeURIComponent(word);
      const url = `https://glosbe.com/${fromLang}/${toLang}/${encodedWord}`;
      
      console.log(`Запрос к URL: ${url}`);
      
      // Выполняем HTTP запрос с теми же заголовками что в Python
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,cs;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Сохраняем HTML файл точно как в Python коде
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${fromLang}_${toLang}_${word}_${timestamp}.htm`;
      const filepath = path.join(parsedWordsFolder, filename);
      
      fs.writeFileSync(filepath, response.data, 'utf8');
      console.log(`Сохранен HTML файл: ${filename}`);

      // Парсим HTML
      const parsedData = this.parseHtmlContent(response.data, word);
      
      // Можем удалить HTML файл после парсинга (как опция)
      // fs.unlinkSync(filepath);
      
      return {
        success: true,
        word: word,
        data: parsedData,
        savedFile: filename
      };

    } catch (error) {
      console.error(`Ошибка при парсинге "${word}":`, error.message);
      return {
        success: false,
        word: word,
        error: error.message
      };
    }
  }

  parseHtmlContent(htmlContent, word) {
    const $ = cheerio.load(htmlContent);
    
    // Извлекаем переводы (аналогично парсингу в вашем оригинальном коде)
    const translations = [];
    
    // Метод 1: Основные переводы
    $('li.translation__item').each((i, elem) => {
      const translationText = $(elem).find('.translation__item__pharse').text().trim();
      if (translationText) {
        translations.push(translationText);
      }
    });
    
    // Метод 2: Менее частые переводы
    if (translations.length === 0) {
      $('#less-frequent-translations-container-0 ul li').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && !text.includes('Less frequent translations')) {
          translations.push(text);
        }
      });
    }
    
    // Извлекаем примеры использования
    const samples = [];
    
    // Примеры в переводах
    $('.translation__example').each((i, elem) => {
      const csText = $(elem).find('[lang="cs"]').text().trim();
      const ruText = $(elem).find('.w-1/2.px-1.ml-2').text().trim();
      
      if (csText && ruText) {
        samples.push({
          phrase: csText,
          translation: ruText
        });
      }
    });
    
    // Примеры в блоке tmem
    if (samples.length === 0) {
      $('#tmem_first_examples .odd\\:bg-slate-100').each((i, elem) => {
        const csText = $(elem).find('.w-1/2.dir-aware-pr-1').text().trim();
        const ruText = $(elem).find('.w-1/2.dir-aware-pl-1').text().trim();
        
        if (csText && ruText) {
          samples.push({
            phrase: csText,
            translation: ruText
          });
        }
      });
    }
    
    return {
      word: word,
      translations: translations.slice(0, 10), // Ограничиваем количество
      samples: samples.slice(0, 3), // Ограничиваем примеры
      source: 'glosbe_direct',
      timestamp: new Date().toISOString()
    };
  }
}

// Создаем экземпляр парсера
const glosbeParser = new GlosbeParser();

// API эндпоинт для перевода слов (обновленный)
app.get('/api/translate', async (req, res) => {
  try {
    const { word, from = 'cs', to = 'ru' } = req.query;
    
    if (!word) {
      return res.status(400).json({ 
        success: false, 
        error: 'Слово для перевода не указано' 
      });
    }

    console.log(`API запрос на перевод: "${word}" (${from} -> ${to})`);

    // Сначала проверяем, есть ли уже сохраненный HTML файл
    const existingFiles = fs.readdirSync(parsedWordsFolder)
      .filter(file => file.includes(`${from}_${to}_${word}_`) && file.endsWith('.htm'));

    if (existingFiles.length > 0) {
      console.log(`Найден существующий HTML файл для "${word}"`);
      const filepath = path.join(parsedWordsFolder, existingFiles[0]);
      const html = fs.readFileSync(filepath, 'utf8');
      const parsedData = glosbeParser.parseHtmlContent(html, word);
      
      return res.json({
        success: true,
        word: word,
        translations: parsedData,
        fromCache: true
      });
    }

    // Если файла нет, парсим с сайта
    const result = await glosbeParser.parseWord(word, from, to);
    
    if (result.success) {
      return res.json({
        success: true,
        word: word,
        translations: result.data,
        fromCache: false
      });
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('Ошибка в API:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера',
      message: error.message
    });
  }
});

// API для массового перевода
app.post('/api/translate/batch', async (req, res) => {
  try {
    const { words, from = 'cs', to = 'ru' } = req.body;
    
    if (!words || !Array.isArray(words)) {
      return res.status(400).json({
        success: false,
        error: 'Требуется массив words'
      });
    }

    console.log(`Массовый перевод ${words.length} слов`);
    
    const results = [];
    
    for (const word of words) {
      if (word && word.trim()) {
        const result = await glosbeParser.parseWord(word.trim(), from, to);
        results.push(result);
        
        // Задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return res.json({
      success: true,
      results: results,
      total: results.length
    });

  } catch (error) {
    console.error('Ошибка в массовом переводе:', error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка при массовом переводе',
      message: error.message
    });
  }
});

// API для управления сохраненными файлами
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(parsedWordsFolder)
      .filter(file => file.endsWith('.htm'))
      .map(file => {
        const filepath = path.join(parsedWordsFolder, file);
        const stats = fs.statSync(filepath);
        return {
          filename: file,
          size: stats.size,
          created: stats.mtime,
          word: file.split('_')[2] // Извлекаем слово из имени файла
        };
      });
    
    res.json({
      success: true,
      files: files,
      count: files.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка при получении списка файлов'
    });
  }
});

// API для удаления файла
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(parsedWordsFolder, filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.json({ success: true, message: 'Файл удален' });
    } else {
      res.status(404).json({ success: false, error: 'Файл не найден' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка при удалении файла' });
  }
});

// Проверка здоровья API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'flashcards-seznam-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Маршрут для всех остальных запросов (для SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Flashcards Seznam API запущен на порту ${PORT}`);
  console.log(`📁 Папка с HTML файлами: ${parsedWordsFolder}`);
  console.log(`🔗 API endpoints:`);
  console.log(`   GET  /api/translate?word=слово&from=cs&to=ru`);
  console.log(`   POST /api/translate/batch`);
  console.log(`   GET  /api/files`);
  console.log(`   GET  /api/health`);
});

module.exports = app;