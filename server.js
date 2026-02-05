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

// Эмуляция Netlify Function для DeepSeek
app.post('/.netlify/functions/translate-deepseek', async (req, res) => {
  try {
    const { text } = req.body;
    const word = Array.isArray(text) ? text[0] : text;
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY missing' });

    console.log(`[Dev Proxy] DeepSeek request for: "${word}"`);

    const systemPrompt = `Ты эксперт по чешскому языку. Твоя задача — проанализировать слово и вернуть строгий JSON объект.
    
    Формат ответа JSON:
    {
      "word": "базовая форма слова (лемма)",
      "word_normalized": "базовая форма lowercase",
      "translations": ["русский перевод 1", "русский перевод 2", "русский перевод 3"],
      "gender": "род (m/f/n) или пустая строка",
      "grammar": "часть речи (noun/verb/adj...)",
      "forms": ["список", "основных", "словоформ", "этого", "слова", "(до 12 штук)"],
      "examples": [
        {"czech": "Пример на чешском", "russian": "Перевод на русский"}
      ]
    }

    ВАЖНО:
    1. Если слово "zkontroluj", то базовая форма "zkontrolovat".
    2. ОТВЕЧАЙ ТОЛЬКО ВАЛИДНЫМ JSON.`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Проанализируй чешское слово: "${word}"` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const resultJSON = JSON.parse(data.choices[0].message.content);
    resultJSON.source = 'deepseek';

    res.json(resultJSON);

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
