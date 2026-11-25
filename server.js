// server.js - Оптимизированный сервер для Flashcards Seznam
// Удалена поддержка DeepL, используется только DeepSeek для анализа

// ВАЖНО: Загружаем переменные окружения из .env в самом начале
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Инициализация приложения Express
const app = express();
const PORT = 3005; // Force port 3005

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
  origin: function (origin, callback) {
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
      deepl: false, // DeepL disabled
      firebase: true,
      netlifyFunctions: true
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Flashcards Seznam API',
    version: '2.1.0',
    description: 'API для перевода чешских слов и фраз через DeepSeek',
    endpoints: {
      health: '/api/health',
      translateDeepSeek: 'POST /.netlify/functions/translate-deepseek'
    }
  });
});

// ==============================================
// NETLIFY FUNCTION EMULATION (FOR LOCAL DEV)
// ==============================================

// Используем тот же handler, что и в продакшене Netlify (единый промпт,
// модель deepseek-flash, режим фраз и валидация).
const deepseekHandler = require('./netlify/functions/translate-deepseek').handler;

app.post('/.netlify/functions/translate-deepseek', async (req, res) => {
  try {
    const result = await deepseekHandler(
      {
        httpMethod: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body || {})
      },
      {}
    );

    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }

    res.status(result.statusCode || 200).send(result.body);
  } catch (error) {
    console.error('[Dev Proxy] DeepSeek Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================================
// FIREBASE DEBUG ENDPOINT
// ==============================================
// Note: This requires firebase-admin to be initialized on backend, 
// which is not currently set up in this project (frontend only).
// So we cannot add a backend route easily without keys.

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
  console.log(`========================================`);
  console.log(`🔗 API Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /.netlify/functions/translate-deepseek`);
  console.log(`========================================`);
  console.log(`✨ Ready for requests!`);
  console.log(`========================================`);
});
