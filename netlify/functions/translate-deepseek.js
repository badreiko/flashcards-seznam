/**
 * Netlify Function для работы с DeepSeek API
 * Генерирует богатые данные (грамматика, формы, переводы) для новых слов
 */

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const { text } = JSON.parse(event.body);
    const word = Array.isArray(text) ? text[0] : text;

    if (!word) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Word is required' }) };
    }

    console.log(`[DeepSeek] Processing: "${word}"`);

    // Промпт настроен на возврат JSON структуры, идентичной нашему приложению
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
    2. Forms должны содержать спряжения/склонения.
    3. Translations должны быть точными.
    4. ОТВЕЧАЙ ТОЛЬКО ВАЛИДНЫМ JSON.`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Проанализируй чешское слово: "${word}"` }
        ],
        temperature: 0.1, // Минимальная температура для точности JSON
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[DeepSeek API Error]', err);
      throw new Error(`DeepSeek API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Парсим ответ нейросети
    let resultJSON;
    try {
      resultJSON = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse DeepSeek JSON:', content);
      throw new Error('Invalid JSON from DeepSeek');
    }

    // Добавляем метаданные
    resultJSON.source = 'deepseek';
    resultJSON.timestamp = new Date().toISOString();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(resultJSON)
    };

  } catch (error) {
    console.error('[DeepSeek Proxy] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
