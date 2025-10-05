/**
 * Netlify Function для проксирования DeepL API
 * Решает проблему CORS при прямых запросах из браузера
 */

exports.handler = async (event, context) => {
  // Разрешаем только POST запросы
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Получаем API ключ из переменных окружения Netlify
    const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

    if (!DEEPL_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'DeepL API key not configured',
          message: 'Please set DEEPL_API_KEY in Netlify environment variables'
        })
      };
    }

    // Парсим тело запроса
    const requestBody = JSON.parse(event.body);
    const { text, source_lang = 'CS', target_lang = 'RU' } = requestBody;

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Text parameter is required' })
      };
    }

    console.log(`[DeepL Proxy] Translating: "${text}"`);

    // Вызываем DeepL API
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: Array.isArray(text) ? text : [text],
        source_lang: source_lang.toUpperCase(),
        target_lang: target_lang.toUpperCase(),
        preserve_formatting: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DeepL Proxy] API Error: ${response.status} - ${errorText}`);

      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: 'DeepL API error',
          status: response.status,
          message: errorText
        })
      };
    }

    const data = await response.json();

    console.log(`[DeepL Proxy] Success: ${data.translations?.length || 0} translations`);

    // Возвращаем результат с CORS заголовками
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('[DeepL Proxy] Error:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
