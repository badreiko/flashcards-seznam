const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Проксирование для API эндпоинтов
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );

  // ВАЖНО: Явное проксирование для эмуляции Netlify Functions
  // React Dev Server по умолчанию может игнорировать пути с точками
  app.use(
    '/.netlify',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );
};
