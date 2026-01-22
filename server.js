// server.js - Оптимизированный сервер для Flashcards Seznam с DeepL API

// ВАЖНО: Загружаем переменные окружения из .env в самом начале
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// DeepL API сервис для высококачественных переводов
const deepLService = require('./src/services/DeepLService');

// Инициализация приложения Express
const app = express();
const PORT = process.env.PORT || 3001;

// Отключаем проверку Host заголовка для Railway deployment
app.set('trust proxy', true);

// Настройка для решения проблемы "Invalid Host header" на Railway
app.use((req, res, next) => {
  // Разрешаем запросы с любого хоста
  const allowedHosts = [
    'flashcards-seznam-production.up.railway.app',
    'flashcards-seznam.netlify.app',
    'localhost',
    '127.0.0.1'
  ];

  // Полностью отключаем проверку хоста для Railway
  if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_ID) {
    // Если мы на Railway, игнорируем все проверки хоста
    req.headers.host = 'flashcards-seznam-production.up.railway.app';
  } else if (req.headers.host && !allowedHosts.some(host => req.headers.host.includes(host))) {
    // Если хост не в списке разрешенных, устанавливаем дефолтный
    req.headers.host = 'flashcards-seznam-production.up.railway.app';
  }

  next();
});

// Разрешенные источники для CORS
const allowedOrigins = [
  'https://flashcards-seznam.netlify.app',
  'https://flashcards-seznam-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

// Настраиваем CORS для всех доменов, особенно для Netlify
app.use(cors({
  origin: function(origin, callback) {
    // Разрешаем запросы без origin (например, из Postman или curl)
    if (!origin) return callback(null, true);

    // Если мы на Railway, разрешаем все запросы
    if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_ID) {
      return callback(null, true);
    }

    // Проверяем, есть ли источник в списке разрешенных
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '').replace('http://', '')))) {
      callback(null, true);
    } else {
      // В продакшене разрешаем все запросы, чтобы избежать проблем
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin']
}));

// Добавляем заголовки CORS вручную для всех ответов
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Если мы на Railway, разрешаем все запросы
  if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_ID) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  // Если запрос с Netlify или другого разрешенного источника
  else if (origin && (allowedOrigins.includes(origin) || allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '').replace('http://', ''))))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // В продакшене разрешаем все запросы, чтобы избежать проблем
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Если это OPTIONS-запрос, сразу отвечаем успехом
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());

// Обслуживание статических файлов (если есть build)
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

// ==============================================
// DEEPL API ENDPOINTS
// ==============================================

// API для перевода через DeepL (высококачественные переводы)
app.get('/api/translate-deepl', async (req, res) => {
  try {
    const { word, text, from, to } = req.query;

    // Принимаем либо word, либо text
    const textToTranslate = word || text;

    if (!textToTranslate) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать word или text для перевода'
      });
    }

    const fromLang = from || 'CS';
    const toLang = to || 'RU';

    console.log(`[DeepL API] Запрос на перевод: "${textToTranslate}" (${fromLang} -> ${toLang})`);

    // Вызываем DeepL API
    const result = await deepLService.translateText(textToTranslate, fromLang, toLang);

    // Проверяем на ошибку
    if (result.error) {
      console.error(`[DeepL API] ❌ Ошибка перевода:`, result.message);
      return res.status(500).json({
        success: false,
        error: result.message,
        source: 'deepl'
      });
    }

    // Возвращаем в формате, совместимом с существующим API
    res.json({
      success: true,
      word: textToTranslate,
      translations: [result.translatedText], // Массив переводов для совместимости
      data: {
        translations: [result.translatedText],
        examples: [], // DeepL не возвращает примеры, но можно добавить позже
        detected_source_language: result.detectedSourceLang
      },
      source: 'deepl',
      charactersUsed: result.charactersUsed,
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('[DeepL API] Критическая ошибка:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при переводе через DeepL',
      details: error.message,
      source: 'deepl'
    });
  }
});

// API для пакетного перевода через DeepL
app.post('/api/translate-deepl/batch', async (req, res) => {
  try {
    const { texts, from, to } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать массив texts для перевода'
      });
    }

    const fromLang = from || 'CS';
    const toLang = to || 'RU';

    console.log(`[DeepL API] Пакетный запрос: ${texts.length} текстов (${fromLang} -> ${toLang})`);

    // Вызываем пакетный перевод DeepL
    const results = await deepLService.translateBatch(texts, fromLang, toLang);

    res.json({
      success: true,
      results: results,
      count: results.length,
      source: 'deepl'
    });

  } catch (error) {
    console.error('[DeepL API] Ошибка пакетного перевода:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при пакетном переводе через DeepL',
      details: error.message,
      source: 'deepl'
    });
  }
});

// API для получения статистики использования DeepL
app.get('/api/deepl/usage', async (req, res) => {
  try {
    const usage = await deepLService.getUsage();

    if (usage.error) {
      return res.status(500).json({
        success: false,
        error: usage.message,
        source: 'deepl'
      });
    }

    res.json({
      success: true,
      usage: usage,
      source: 'deepl'
    });

  } catch (error) {
    console.error('[DeepL API] Ошибка получения статистики:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка при получении статистики DeepL',
      details: error.message,
      source: 'deepl'
    });
  }
});

// ==============================================
// HEALTH & INFO ENDPOINTS
// ==============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const uptimeMinutes = Math.floor(uptime / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  const uptimeFormatted = `${uptimeMinutes}m ${uptimeSeconds}s`;

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: uptimeFormatted,
    uptimeSeconds: uptime,
    service: 'Flashcards Seznam API',
    version: '2.0.0',
    features: {
      deepl: true,
      firebase: true,
      netlifyFunctions: true
    },
    endpoints: {
      deepl: [
        'GET  /api/translate-deepl?word=slovo&from=CS&to=RU',
        'POST /api/translate-deepl/batch',
        'GET  /api/deepl/usage'
      ]
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Flashcards Seznam API',
    version: '2.0.0',
    description: 'API для перевода чешских слов через DeepL',
    endpoints: {
      health: '/api/health',
      translateDeepL: '/api/translate-deepl?word=slovo',
      translateDeepLBatch: '/api/translate-deepl/batch',
      deeplUsage: '/api/deepl/usage'
    }
  });
});

// ==============================================
// NETLIFY FUNCTION EMULATION (FOR LOCAL DEV)
// ==============================================

// Эмуляция Netlify Function для локальной разработки
// Клиент стучится сюда через прокси (http://localhost:3000 -> http://localhost:3001)
app.post('/.netlify/functions/translate-deepl', async (req, res) => {
  try {
    console.log('[Dev Proxy] Received request to Netlify Function emulation');
    
    const { text, source_lang = 'CS', target_lang = 'RU' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    // Приводим text к массиву, как это делает реальная функция
    const textsToTranslate = Array.isArray(text) ? text : [text];

    console.log(`[Dev Proxy] Translating ${textsToTranslate.length} items:`, textsToTranslate);

    // Используем существующий сервис
    const results = await deepLService.translateBatch(
      textsToTranslate, 
      source_lang, 
      target_lang
    );

    // Формируем ответ в формате DeepL API (как это делает прокси)
    // Реальная функция возвращает сырой ответ от DeepL API
    const responseData = {
      translations: results.map(r => ({
        text: r.translatedText,
        detected_source_language: r.detectedSourceLang
      }))
    };

    console.log('[Dev Proxy] Success, returning:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('[Dev Proxy] Error:', error);
    res.status(500).json({
      error: 'Internal server error (Dev Proxy)',
      message: error.message
    });
  }
});

// Catch-all для React приложения (если есть build)
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: 'Build folder not found. Please run npm run build first.'
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Flashcards Seznam API v2.0.0`);
  console.log(`========================================`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 DeepL API: ${process.env.DEEPL_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  console.log(`========================================`);
  console.log(`🔗 API Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/translate-deepl?word=slovo`);
  console.log(`   POST /api/translate-deepl/batch`);
  console.log(`   GET  /api/deepl/usage`);
  console.log(`========================================`);
  console.log(`✨ Ready for requests!`);
  console.log(`========================================`);
});
