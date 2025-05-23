// server.js - Оптимизированный сервер без сохранения HTML файлов для Flashcards Seznam
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Отключаем проверку Host заголовка для Railway deployment
app.set('trust proxy', true);

// Настройка для решения проблемы "Invalid Host header" на Railway
app.use((req, res, next) => {
  // Разрешаем запросы с любого хоста
  req.headers.host = req.headers.host || 'flashcards-seznam-production.up.railway.app';
  next();
});

// Важно: настройки CORS должны быть применены на Railway

// Настраиваем CORS для всех доменов, особенно для Netlify
app.use(cors({
  origin: ['https://flashcards-seznam.netlify.app', 'http://localhost:3000', '*'],  // Явно разрешаем Netlify и localhost
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Добавляем заголовки CORS вручную для всех ответов
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Если запрос с Netlify или localhost, явно разрешаем этот домен
  if (origin && (origin.includes('netlify.app') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
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
    this.requestDelay = 1500; // Увеличенная задержка между запросами
    this.lastRequestTime = 0;
    this.saveFiles = process.env.SAVE_HTML_FILES === 'true'; // false по умолчанию
    this.maxRetries = 3; // Максимальное количество повторных попыток
    this.retryDelay = 2000; // Задержка между повторными попытками (мс)
    
    // Ротация User-Agent для избежания блокировки
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    ];
    
    // Селекторы для парсинга переводов (в порядке приоритета)
    this.translationSelectors = [
      'li.translation__item .translation__item__pharse', // Основной селектор
      '#less-frequent-translations-container-0 ul li',   // Менее частые переводы
      '.translation__translations .translation__item',    // Дополнительные переводы
      '.translation__pharse',                            // Альтернативный селектор
      '.translation-item__phrase',                       // Новый возможный селектор
      '.phrase-translations__translation',               // Еще один возможный селектор
      '.translation-item'                                // Запасной селектор
    ];
    
    // Селекторы для примеров (в порядке приоритета)
    this.exampleSelectors = [
      { container: '.translation__example', source: '[lang="cs"]', target: '.w-1/2.px-1.ml-2' },
      { container: '#tmem_first_examples .odd\\:bg-slate-100', source: '.w-1/2.dir-aware-pr-1', target: '.w-1/2.dir-aware-pl-1' },
      { container: '.tmem_first_examples .bg-slate-50', source: '.segment:first-child', target: '.segment:nth-child(2)' },
      { container: '.examples-wrapper .example', source: '.example-source', target: '.example-target' },
      { container: '.example-item', source: '.source-text', target: '.target-text' }
    ];
    
    // Счетчик успешных и неуспешных парсингов для мониторинга
    this.stats = {
      totalRequests: 0,
      successfulParses: 0,
      failedParses: 0,
      retries: 0,
      emptyResults: 0,
      lastParsedSelectors: {}
    };
  }

  async parseWord(word, fromLang = 'cs', toLang = 'ru') {
    // Увеличиваем счетчик запросов
    this.stats.totalRequests++;
    
    // Функция для выполнения запроса с повторными попытками
    const fetchWithRetry = async (retryCount = 0) => {
      try {
        // Добавляем задержку между запросами
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
          await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();

        // Выбираем случайный User-Agent для ротации
        const randomUserAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        
        console.log(`[${new Date().toLocaleTimeString()}] Парсим слово: "${word}" (попытка ${retryCount + 1}/${this.maxRetries + 1})`);
        
        // Формируем URL
        const encodedWord = encodeURIComponent(word);
        const url = `https://glosbe.com/${fromLang}/${toLang}/${encodedWord}`;
        
        console.log(`Запрос к URL: ${url} (User-Agent: ${randomUserAgent.substring(0, 30)}...)`);
        
        // Выполняем HTTP запрос с улучшенными заголовками
        const response = await axios.get(url, {
          headers: {
            'User-Agent': randomUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,cs;q=0.6',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': 'https://glosbe.com/',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1'
          },
          timeout: 20000, // Увеличенный таймаут
          maxRedirects: 5,
          validateStatus: status => status === 200 // Принимаем только 200 как успех
        });

        // Проверяем, что страница не пустая и не содержит капчу
        if (!response.data || response.data.length < 1000) {
          throw new Error('Получена пустая страница');
        }
        
        if (response.data.includes('captcha') || response.data.includes('robot') || response.data.includes('blocked')) {
          throw new Error('Обнаружена капча или блокировка');
        }

        // Парсим данные в памяти
        const parsedData = this.parseHtmlContent(response.data, word);
        
        // Проверяем, что есть результаты
        if (parsedData.translations.length === 0 && parsedData.samples.length === 0) {
          this.stats.emptyResults++;
          console.warn(`Пустой результат парсинга для "${word}"`);
          
          // Если нет результатов, но есть еще попытки, пробуем снова
          if (retryCount < this.maxRetries) {
            this.stats.retries++;
            console.log(`Повторная попытка для "${word}" через ${this.retryDelay/1000} сек...`);
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            return await fetchWithRetry(retryCount + 1);
          }
        }
        
        // Сохраняем файл для отладки, если флаг включен
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
        
        // Увеличиваем счетчик успешных парсингов
        this.stats.successfulParses++;
        
        return {
          success: true,
          word: word,
          data: parsedData,
          savedFile: this.saveFiles ? 'временно сохранен' : 'не сохранен',
          retryCount: retryCount
        };
      } catch (error) {
        // Если есть еще попытки, пробуем снова
        if (retryCount < this.maxRetries) {
          this.stats.retries++;
          console.warn(`Ошибка при парсинге "${word}": ${error.message}. Повторная попытка ${retryCount + 1}/${this.maxRetries}...`);
          
          // Увеличиваем задержку с каждой попыткой (экспоненциальная задержка)
          const delay = this.retryDelay * Math.pow(1.5, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return await fetchWithRetry(retryCount + 1);
        }
        
        // Если исчерпаны все попытки, возвращаем ошибку
        this.stats.failedParses++;
        throw error;
      }
    };
    
    try {
      // Запускаем функцию с повторными попытками
      return await fetchWithRetry();
    } catch (error) {
      console.error(`Ошибка при парсинге "${word}" (после всех попыток):`, error.message);
      return {
        success: false,
        word: word,
        error: error.message,
        retries: this.maxRetries
      };
    }
  }

  parseHtmlContent(htmlContent, word) {
    try {
      const $ = cheerio.load(htmlContent);
      
      // Извлекаем переводы с использованием всех возможных селекторов
      const translations = [];
      const usedSelectors = {}; // Для отслеживания, какие селекторы сработали
      
      // Проходим по всем селекторам переводов в порядке приоритета
      for (const selector of this.translationSelectors) {
        let found = false;
        
        // Если селектор содержит пробел, это означает, что нужно найти элемент и затем его дочерний элемент
        if (selector.includes(' ')) {
          const [containerSelector, childSelector] = selector.split(' ').map(s => s.trim());
          $(containerSelector).each((i, elem) => {
            const translationText = $(elem).find(childSelector).text().trim();
            if (translationText && !translationText.includes('Less frequent translations')) {
              translations.push(translationText);
              found = true;
            }
          });
        } else {
          // Иначе просто ищем элементы по селектору
          $(selector).each((i, elem) => {
            const translationText = $(elem).text().trim();
            if (translationText && !translationText.includes('Less frequent translations')) {
              translations.push(translationText);
              found = true;
            }
          });
        }
        
        // Если нашли переводы с этим селектором, отмечаем его как использованный
        if (found) {
          usedSelectors[selector] = true;
        }
      }
      
      // Извлекаем примеры использования
      const samples = [];
      const usedExampleSelectors = {}; // Для отслеживания, какие селекторы примеров сработали
      
      // Проходим по всем селекторам примеров в порядке приоритета
      for (const selectorSet of this.exampleSelectors) {
        let found = false;
        
        $(selectorSet.container).each((i, elem) => {
          let sourceText, targetText;
          
          // Если селектор источника содержит :first-child или :nth-child
          if (selectorSet.source.includes(':')) {
            // Ищем элементы напрямую внутри контейнера
            sourceText = $(elem).find(selectorSet.source).text().trim();
            targetText = $(elem).find(selectorSet.target).text().trim();
          } else {
            // Стандартный поиск
            sourceText = $(elem).find(selectorSet.source).text().trim();
            targetText = $(elem).find(selectorSet.target).text().trim();
          }
          
          if (sourceText && targetText) {
            samples.push({
              phrase: sourceText,
              translation: targetText
            });
            found = true;
          }
        });
        
        // Если нашли примеры с этим набором селекторов, отмечаем его как использованный
        if (found) {
          usedExampleSelectors[selectorSet.container] = true;
        }
        
        // Если уже нашли достаточно примеров, прекращаем поиск
        if (samples.length >= 5) {
          break;
        }
      }
      
      // Поиск по всему HTML для случаев, когда ни один из известных селекторов не сработал
      if (translations.length === 0) {
        // Ищем элементы, которые могут содержать переводы (div, span, li с текстом)
        $('div, span, li').each((i, elem) => {
          const text = $(elem).text().trim();
          // Проверяем, что текст не слишком длинный и не слишком короткий
          if (text && text.length > 1 && text.length < 50 && 
              !text.includes('<') && !text.includes('>') && 
              !text.includes('Glosbe') && !text.includes('translation')) {
            translations.push(text);
          }
        });
      }
      
      // Сохраняем информацию о том, какие селекторы были использованы
      this.stats.lastParsedSelectors = {
        translations: usedSelectors,
        examples: usedExampleSelectors
      };
      
      // Фильтруем и удаляем дубликаты
      const uniqueTranslations = [...new Set(translations)]
        .filter(t => t.length > 0 && t.length < 100) // Исключаем слишком длинные строки
        .filter(t => !t.includes('http') && !t.includes('www')) // Исключаем URL
        .slice(0, 10); // Ограничиваем количество
      
      // Проверяем, не содержат ли переводы HTML-теги
      const cleanTranslations = uniqueTranslations.map(t => {
        // Удаляем HTML-теги, если они есть
        return t.replace(/<[^>]*>/g, '');
      });
      
      return {
        word: word,
        translations: cleanTranslations,
        samples: samples.slice(0, 5), // Ограничиваем примеры
        source: 'glosbe_direct',
        timestamp: new Date().toISOString(),
        usedSelectors: Object.keys(usedSelectors),
        usedExampleSelectors: Object.keys(usedExampleSelectors)
      };
    } catch (error) {
      console.error(`Ошибка при парсинге HTML для "${word}":`, error.message);
      // Возвращаем пустой результат в случае ошибки
      return {
        word: word,
        translations: [],
        samples: [],
        source: 'glosbe_direct',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Создаем экземпляр парсера
const glosbeParser = new GlosbeParser();

// Функция для очистки старых HTML-файлов
function cleanupOldHtmlFiles(maxAgeDays = 30) {
  try {
    const cutoffDate = new Date(Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000));
    let deletedCount = 0;
    let totalSize = 0;
    
    if (fs.existsSync(parsedWordsFolder)) {
      const files = fs.readdirSync(parsedWordsFolder)
        .filter(file => file.endsWith('.htm'))
        .map(file => path.join(parsedWordsFolder, file));
      
      files.forEach(file => {
        try {
          const stats = fs.statSync(file);
          if (stats.birthtime < cutoffDate) {
            totalSize += stats.size;
            fs.unlinkSync(file);
            deletedCount++;
          }
        } catch (err) {
          console.warn(`Ошибка при удалении файла ${file}:`, err.message);
        }
      });
      
      if (deletedCount > 0) {
        console.log(`🧹 Очистка: удалено ${deletedCount} старых HTML-файлов (${(totalSize / 1024).toFixed(2)} KB)`);
      }
      
      return { deletedCount, totalSize };
    }
  } catch (error) {
    console.error('Ошибка при очистке старых HTML-файлов:', error.message);
    return { deletedCount: 0, totalSize: 0, error: error.message };
  }
}

// Запускаем очистку старых файлов при запуске сервера
cleanupOldHtmlFiles();

// Планируем регулярную очистку каждые 24 часа
setInterval(() => {
  console.log('Запланированная очистка старых HTML-файлов...');
  cleanupOldHtmlFiles();
}, 24 * 60 * 60 * 1000);

// API для получения статистики парсинга
app.get('/api/parser-stats', (req, res) => {
  try {
    // Добавляем информацию о времени работы сервера
    const uptime = process.uptime();
    const uptimeFormatted = {
      days: Math.floor(uptime / 86400),
      hours: Math.floor((uptime % 86400) / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
      seconds: Math.floor(uptime % 60)
    };
    
    // Получаем информацию о файлах в папке с HTML
    let htmlFiles = [];
    let totalHtmlSize = 0;
    
    if (fs.existsSync(parsedWordsFolder)) {
      htmlFiles = fs.readdirSync(parsedWordsFolder)
        .filter(file => file.endsWith('.htm'))
        .map(file => {
          const filePath = path.join(parsedWordsFolder, file);
          try {
            const stats = fs.statSync(filePath);
            totalHtmlSize += stats.size;
            return {
              name: file,
              size: stats.size,
              created: stats.mtime
            };
          } catch (err) {
            return null;
          }
        })
        .filter(file => file !== null)
        .sort((a, b) => new Date(b.created) - new Date(a.created)); // Сортируем по дате создания (новые сверху)
    }
    
    // Формируем полную статистику
    const stats = {
      parser: glosbeParser.stats,
      server: {
        uptime: uptimeFormatted,
        uptimeSeconds: uptime,
        startTime: new Date(Date.now() - (uptime * 1000)).toISOString(),
        currentTime: new Date().toISOString(),
        memory: process.memoryUsage()
      },
      htmlFiles: {
        count: htmlFiles.length,
        totalSize: totalHtmlSize,
        totalSizeFormatted: `${(totalHtmlSize / 1024).toFixed(2)} KB`,
        files: htmlFiles.slice(0, 10) // Ограничиваем список файлов для вывода
      },
      lastParsedSelectors: glosbeParser.stats.lastParsedSelectors,
      successRate: glosbeParser.stats.totalRequests > 0 ? 
        (glosbeParser.stats.successfulParses / glosbeParser.stats.totalRequests * 100).toFixed(2) + '%' : '0%'
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Ошибка при получении статистики парсера:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики', details: error.message });
  }
});

// API для ручной очистки HTML-файлов
app.delete('/api/cleanup-html-files', async (req, res) => {
  try {
    const maxAgeDays = parseInt(req.query.maxAgeDays) || 7; // По умолчанию 7 дней
    const result = cleanupOldHtmlFiles(maxAgeDays);
    res.json({
      success: true,
      message: `Старые HTML-файлы удалены (${result.deletedCount} файлов, ${(result.totalSize / 1024).toFixed(2)} KB)`,
      ...result
    });
  } catch (error) {
    console.error('Ошибка при очистке старых HTML-файлов:', error);
    res.status(500).json({ error: 'Ошибка при очистке старых HTML-файлов', details: error.message });
  }
});

// Промежуточный обработчик для всех API запросов
app.use('/api/*', (req, res, next) => {
  // Проверяем, что запрос пришел с Netlify или другого разрешенного источника
  const origin = req.headers.origin || req.headers.referer;
  
  // Если это OPTIONS-запрос (preflight), сразу отвечаем успехом
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Добавляем дополнительные заголовки для решения проблем с CORS
  res.header('Content-Type', 'application/json');
  
  // Продолжаем к следующему обработчику
  next();
});

// API эндпоинт для проверки соединения
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    service: 'flashcards-seznam-api'
  });
});

// API для перевода слова
app.get('/api/translate', async (req, res) => {
  try {
    const { word, from, to, checkLocal } = req.query;
    
    if (!word) {
      return res.status(400).json({ error: 'Необходимо указать слово для перевода' });
    }
    
    const fromLang = from || 'cs';
    const toLang = to || 'ru';
    
    console.log(`Запрос на перевод: ${word} (${fromLang} -> ${toLang})`);
    
    // Проверяем существующие файлы только если checkLocal=true
    if (checkLocal === 'true' && fs.existsSync(parsedWordsFolder)) {
      const existingFiles = fs.readdirSync(parsedWordsFolder)
        .filter(file => file.includes(`${fromLang}_${toLang}_${word}_`) && file.endsWith('.htm'));

      if (existingFiles.length > 0) {
        console.log(`Найден существующий HTML файл для "${word}"`);
        const filepath = path.join(parsedWordsFolder, existingFiles[0]);
        const html = fs.readFileSync(filepath, 'utf8');
        const parsedData = glosbeParser.parseHtmlContent(html, word);
        
        return res.json({
          success: true,
          word: word,
          data: parsedData,
          source: 'local_cache'
        });
      }
    }
    
    const result = await glosbeParser.parseWord(word, fromLang, toLang);
    res.json(result);
  } catch (error) {
    console.error('Ошибка при переводе:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка при переводе', 
      details: error.message 
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

// Основной маршрут для React приложения
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Catch-all маршрут для React Router (должен быть последним)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Запускаем сервер
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