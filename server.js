// server.js - Оптимизированный сервер без сохранения HTML файлов для Flashcards Seznam
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Важно: настройки CORS должны быть применены на Railway

// Настраиваем CORS для всех доменов
app.use(cors({
  origin: '*',  // Разрешаем запросы с любого домена
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Добавляем заголовки CORS вручную для всех ответов
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.use(express.json());

// Мультер для загрузки файлов (если понадобится)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB лимит
});

// Папка с HTML-файлами (оставляем для совместимости, но не используем активно)
const parsedWordsFolder = path.join(__dirname, 'parsed_glosbe_words');
if (!fs.existsSync(parsedWordsFolder)) {
  fs.mkdirSync(parsedWordsFolder, { recursive: true });
}

// Функция очистки всех старых HTML файлов
function cleanupAllFiles() {
  try {
    if (fs.existsSync(parsedWordsFolder)) {
      const files = fs.readdirSync(parsedWordsFolder)
        .filter(file => file.endsWith('.htm') || file.endsWith('.html'));
      
      files.forEach(file => {
        const filepath = path.join(parsedWordsFolder, file);
        fs.unlinkSync(filepath);
      });
      
      if (files.length > 0) {
        console.log(`🧹 Удалено ${files.length} старых HTML файлов при запуске`);
      }
    }
  } catch (error) {
    console.warn('Ошибка при очистке файлов:', error);
  }
}

// Функция периодической очистки (запускается каждый час)
function cleanupOldFiles() {
  try {
    if (!fs.existsSync(parsedWordsFolder)) return;
    
    const files = fs.readdirSync(parsedWordsFolder);
    const now = Date.now();
    let deletedCount = 0;
    
    files.forEach(file => {
      if (!file.endsWith('.htm') && !file.endsWith('.html')) return;
      
      const filepath = path.join(parsedWordsFolder, file);
      const stats = fs.statSync(filepath);
      const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      // Удаляем файлы старше 1 часа
      if (ageHours > 1) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });
    
    if (deletedCount > 0) {
      console.log(`🧹 Удалено ${deletedCount} старых HTML файлов (автоочистка)`);
    }
  } catch (error) {
    console.warn('Ошибка при автоочистке файлов:', error);
  }
}

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'build')));

// Оптимизированный класс для парсинга Glosbe БЕЗ сохранения файлов
class GlosbeParser {
  constructor() {
    this.requestDelay = 1000; // Задержка между запросами
    this.lastRequestTime = 0;
    this.saveFiles = process.env.SAVE_HTML_FILES === 'true'; // false по умолчанию
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
      
      // Формируем URL точно как в Python коде
      const encodedWord = encodeURIComponent(word);
      const url = `https://glosbe.com/${fromLang}/${toLang}/${encodedWord}`;
      
      console.log(`Запрос к URL: ${url}`);
      
      // Выполняем HTTP запрос
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

      // ✅ ОПТИМИЗАЦИЯ: Парсим СРАЗУ в памяти, не сохраняя файл
      const parsedData = this.parseHtmlContent(response.data, word);
      
      // 🗂️ ОПЦИОНАЛЬНО: Сохраняем файл только если флаг включен (для отладки)
      if (this.saveFiles) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${fromLang}_${toLang}_${word}_${timestamp}.htm`;
        const filepath = path.join(parsedWordsFolder, filename);
        
        try {
          fs.writeFileSync(filepath, response.data, 'utf8');
          console.log(`📁 Сохранен HTML файл для отладки: ${filename}`);
          
          // Удаляем через 10 минут
          setTimeout(() => {
            try {
              if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log(`🗑️ Удален файл отладки: ${filename}`);
              }
            } catch (delError) {
              console.warn(`Ошибка при удалении файла отладки: ${delError.message}`);
            }
          }, 10 * 60 * 1000); // 10 минут
          
        } catch (saveError) {
          console.warn(`Ошибка при сохранении файла отладки: ${saveError.message}`);
        }
      }
      
      return {
        success: true,
        word: word,
        data: parsedData,
        savedFile: this.saveFiles ? 'временно сохранен' : 'не сохранен'
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
    
    // Извлекаем переводы
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
    
    // Метод 3: Дополнительные переводы
    if (translations.length === 0) {
      $('.translation__translations .translation__item').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text) {
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
    
    // Дополнительные примеры
    if (samples.length === 0) {
      $('.tmem_first_examples .bg-slate-50').each((i, elem) => {
        const segments = $(elem).find('.segment');
        if (segments.length >= 2) {
          const csText = $(segments[0]).text().trim();
          const ruText = $(segments[1]).text().trim();
          
          if (csText && ruText) {
            samples.push({
              phrase: csText,
              translation: ruText
            });
          }
        }
      });
    }
    
    return {
      word: word,
      translations: [...new Set(translations)].slice(0, 10), // Убираем дубли, ограничиваем
      samples: samples.slice(0, 5), // Ограничиваем примеры
      source: 'glosbe_direct',
      timestamp: new Date().toISOString()
    };
  }
}

// Создаем экземпляр парсера
const glosbeParser = new GlosbeParser();

// API эндпоинт для перевода слов (оптимизированный)
app.get('/api/translate', async (req, res) => {
  try {
    const { word, from = 'cs', to = 'ru', checkLocal = false } = req.query;
    
    if (!word) {
      return res.status(400).json({ 
        success: false, 
        error: 'Слово для перевода не указано' 
      });
    }

    console.log(`API запрос на перевод: "${word}" (${from} -> ${to})`);

    // Проверяем существующие файлы только если checkLocal=true
    if (checkLocal) {
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
          fromLocalFile: true
        });
      }
    }

    // Парсим с сайта (БЕЗ сохранения файла)
    const result = await glosbeParser.parseWord(word, from, to);
    
    if (result.success) {
      return res.json({
        success: true,
        word: word,
        translations: result.data,
        fromCache: false,
        fileSaved: result.savedFile
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

// API для сохранения HTML (из glosbeTranslator.js)
app.post('/api/save-html', upload.single('html'), (req, res) => {
  try {
    const { word, from_lang = 'cs', to_lang = 'ru' } = req.body;
    
    if (!req.file || !word) {
      return res.status(400).json({
        success: false,
        error: 'Требуется файл HTML и слово'
      });
    }
    
    const htmlContent = req.file.buffer.toString();
    
    // Парсим СРАЗУ в памяти, не сохраняя файл
    const parsedData = glosbeParser.parseHtmlContent(htmlContent, word);
    
    res.json({
      success: true,
      data: parsedData,
      message: 'HTML обработан в памяти без сохранения'
    });
    
  } catch (error) {
    console.error('Ошибка при обработке HTML:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при обработке HTML',
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
      total: results.length,
      message: 'Файлы не сохранялись, только обработка в памяти'
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
      .filter(file => file.endsWith('.htm') || file.endsWith('.html'))
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
      count: files.length,
      message: files.length === 0 ? 'Файлы автоматически удаляются после обработки' : 'Найдены временные файлы'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка при получении списка файлов'
    });
  }
});

// API для подсчета HTML файлов
app.get('/api/html-files-count', (req, res) => {
  try {
    const files = fs.readdirSync(parsedWordsFolder)
      .filter(file => file.endsWith('.htm') || file.endsWith('.html'));
    
    res.json({
      success: true,
      count: files.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      count: 0,
      error: 'Ошибка при подсчете файлов'
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
      res.json({ 
        success: true, 
        message: 'Файл удален' 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Файл не найден' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка при удалении файла' 
    });
  }
});

// API для ручной очистки всех файлов
app.delete('/api/files', (req, res) => {
  try {
    cleanupAllFiles();
    res.json({
      success: true,
      message: 'Все HTML файлы удалены'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка при очистке файлов'
    });
  }
});

// Проверка здоровья API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'flashcards-seznam-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      saveFiles: glosbeParser.saveFiles,
      autoCleanup: true,
      memoryParsing: true
    }
  });
});

// Маршрут для всех остальных запросов (для SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Очистка при запуске сервера
console.log('🧹 Очистка старых HTML файлов при запуске...');
cleanupAllFiles();

// Запускаем периодическую очистку каждый час
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Flashcards Seznam API запущен на порту ${PORT}`);
  console.log(`📁 Папка для временных файлов: ${parsedWordsFolder}`);
  console.log(`🗑️ Автоочистка файлов: включена`);
  console.log(`💾 Сохранение HTML файлов: ${glosbeParser.saveFiles ? 'включено (отладка)' : 'отключено'}`);
  console.log(`🔗 API endpoints:`);
  console.log(`   GET  /api/translate?word=слово&from=cs&to=ru`);
  console.log(`   POST /api/translate/batch`);
  console.log(`   GET  /api/files`);
  console.log(`   DELETE /api/files (очистить все)`);
  console.log(`   GET  /api/health`);
});

module.exports = app;