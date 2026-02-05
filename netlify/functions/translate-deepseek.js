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

    // Промпт настроен на возврат богатой структуры данных
    const systemPrompt = `Ты эксперт по чешскому языку. Для чешского слова верни JSON со ВСЕМИ полями:

{
  "base": "базовая форма (infinitiv для глаголов, nominativ sg для существительных)",
  "pos": "noun|verb|adj|adv|prep|conj|pron|num|part|interj",
  "gender": "m|f|n или null",
  "vzor": "образец склонения/спряжения (ОБЯЗАТЕЛЬНО! например: žena, muž, růže, město, hrad, kost, píseň, stavení, soudce, předseda, dělat, prosit, tisknout...)",
  "vazba": "управление (например: na + 4, s + 7) или null",
  "ipa": "ОБЯЗАТЕЛЬНАЯ фонетическая транскрипция IPA в квадратных скобках, например: [ˈprɔsiːm], [ˈdɛlat], [ˈʒɛna]",
  "stress": "слово с ударением (первый слог всегда ударный в чешском) или null",
  "style": "hovor.|kniž.|zastaralé|expr.|vulg. или null",
  "cefr_level": "ОБЯЗАТЕЛЬНО уровень A1|A2|B1|B2|C1|C2",
  "is_corrected": true/false,
  "translations": ["перевод на русский 1", "перевод 2", "перевод 3"],
  "translations_ua": ["ОБЯЗАТЕЛЬНО переклад українською 1", "переклад 2", "переклад 3"],
  "forms": ["форма1", "форма2", "..."],
  "examples": [{"czech": "Пример на чешском.", "russian": "Перевод на русский."}],
  "aspect_pair": "для глаголов: видовая пара (napsat ↔ psát) или null",
  "frequency_rank": числовой ранг частоты 1-50000 (1=очень частое)
}

КРИТИЧЕСКИ ВАЖНО:
1. ipa - ОБЯЗАТЕЛЬНО! Всегда указывай IPA транскрипцию
2. vzor - ОБЯЗАТЕЛЬНО! Всегда указывай vzor (образец)
3. cefr_level - ОБЯЗАТЕЛЬНО! Оцени уровень сложности
4. translations_ua - ОБЯЗАТЕЛЬНО! Переводы на украинский
5. Ответ ТОЛЬКО валидный JSON без markdown и пояснений`;

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
          { role: "user", content: `Полный лингвистический анализ чешского слова: "${word}"` }
        ],
        temperature: 0.1,
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
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse DeepSeek JSON:', content);
      throw new Error('Invalid JSON from DeepSeek');
    }

    // Формируем результат с гарантированными полями
    const result = {
      // Основные поля
      word: parsed.base || parsed.word || word,
      word_normalized: (parsed.base || parsed.word || word).toLowerCase(),
      translations: parsed.translations || [],
      gender: parsed.gender || "",
      grammar: parsed.pos || parsed.grammar || "",

      // Расширенные поля (ОБЯЗАТЕЛЬНЫЕ)
      ipa: parsed.ipa || "",
      vzor: parsed.vzor || "",
      vazba: parsed.vazba || "",
      cefr_level: parsed.cefr_level || parsed.cefrLevel || "",
      translations_ua: parsed.translations_ua || parsed.translationsUa || [],
      stress: parsed.stress || "",
      style: parsed.style || "",
      is_corrected: parsed.is_corrected || false,

      // Дополнительные поля для умного обучения
      aspect_pair: parsed.aspect_pair || parsed.aspectPair || "",
      frequency_rank: parsed.frequency_rank || parsed.frequencyRank || 0,
      part_of_speech: parsed.pos || parsed.grammar || "",

      // Формы и примеры
      forms: Array.isArray(parsed.forms)
        ? parsed.forms
        : (parsed.forms && typeof parsed.forms === 'object')
          ? Object.values(parsed.forms).filter(v => typeof v === 'string')
          : [],
      examples: parsed.examples || [],

      // Структурированные формы (для будущего использования)
      forms_detailed: (!Array.isArray(parsed.forms) && typeof parsed.forms === 'object')
        ? parsed.forms
        : null,

      // Метаданные
      source: 'deepseek',
      timestamp: new Date().toISOString()
    };

    console.log(`[DeepSeek] Result for "${word}": ipa=${result.ipa}, vzor=${result.vzor}, ua=${result.translations_ua.length}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[DeepSeek Proxy] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
