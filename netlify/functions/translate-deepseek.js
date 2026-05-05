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

    const { text, mode: requestedMode, type } = JSON.parse(event.body);
    const word = Array.isArray(text) ? text[0] : text;

    if (!word) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Word is required' }) };
    }

    const normalizedInput = String(word).trim();
    const modeHint = requestedMode || type;
    const mode = modeHint === 'phrase' || /\s/.test(normalizedInput) ? 'phrase' : 'word';

    console.log(`[DeepSeek] Processing (${mode}): "${word}"`);

    // Промпт настроен на возврат богатой структуры данных
    const wordSystemPrompt = `Ты эксперт по чешскому языку. Для чешского слова верни JSON со ВСЕМИ полями:

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
5. Ответ ТОЛЬКО валидный JSON без markdown и пояснений
6. Если слово - предлог или союз, поле vzor может быть пустым.`;

    const phraseSystemPrompt = `Ты эксперт по чешскому языку. На вход приходит ЧЕШСКАЯ ФРАЗА, словосочетание, термин или устойчивое выражение. Верни JSON со ВСЕМИ полями:

{
  "base": "полная каноническая/лемматизированная форма ВСЕЙ фразы, не отдельное первое слово",
  "pos": "phrase|collocation|idiom|term|noun|verb|adj|adv",
  "gender": "m|f|n или null, если определяется по главному существительному",
  "vzor": "образец для главного слова фразы, если применимо, иначе null",
  "vazba": "управление всей фразы, если есть, иначе null",
  "ipa": "IPA транскрипция ВСЕЙ фразы в квадратных скобках",
  "stress": "фраза с ударением или null",
  "style": "hovor.|kniž.|zastaralé|expr.|vulg.|term. или null",
  "cefr_level": "A1|A2|B1|B2|C1|C2",
  "is_corrected": true/false,
  "translations": ["перевод ВСЕЙ фразы на русский 1", "перевод ВСЕЙ фразы 2", "перевод ВСЕЙ фразы 3"],
  "translations_ua": ["переклад ВСІЄЇ фрази українською 1", "переклад ВСІЄЇ фрази 2", "переклад ВСІЄЇ фрази 3"],
  "forms": ["вариант/форма ВСЕЙ фразы 1", "вариант/форма ВСЕЙ фразы 2"],
  "examples": [{"czech": "Пример с полной фразой.", "russian": "Перевод примера."}],
  "aspect_pair": null,
  "frequency_rank": числовой ранг частоты 1-50000
}

КРИТИЧЕСКИ ВАЖНО:
1. Переводи фразу как единый смысловой блок. Никогда не возвращай перевод только первого слова.
2. base обязан быть полной фразой. Нельзя возвращать одно слово, если вход содержит несколько слов.
3. Если входная фраза стоит в падеже/числе/роде, приведи ВСЮ фразу к базовой форме, сохранив все смысловые слова.
4. Если это технический термин, сохраняй терминологический смысл, а не буквальный перевод отдельных слов.
5. forms должны быть формами/вариантами всей фразы. Не перечисляй формы одного первого слова.
6. Если фраза содержит имя собственное, название места, святого, учреждения или термин, сохрани это уточнение в base и переводе.
7. Если фраза содержит ошибку или мусор, исправь ее до ближайшей осмысленной полной чешской фразы и поставь is_corrected=true.
8. Нельзя заменять входную фразу другой словарной фразой из другой темы. base должен быть исходной фразой или ее очевидным исправлением.
9. Пример: вход "klášteře svatého Daniela" -> base "klášter svatého Daniela", translations ["монастырь святого Даниила"], НЕ "klášter".
10. Пример: вход "benzín bezolovnatý" -> base "bezolovnatý benzín" или "benzín bezolovnatý", translations ["неэтилированный бензин"], НЕ другая техническая фраза.
11. Ответ ТОЛЬКО валидный JSON без markdown и пояснений.`;

    const systemPrompt = mode === 'phrase' ? phraseSystemPrompt : wordSystemPrompt;
    const userPrompt = mode === 'phrase'
      ? `Analyze this Czech phrase as one whole expression, not by first word: "${word}"`
      : `Analysis of: "${word}"`;

    const requestDeepSeek = async (prompt, promptUser) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 секунд макс на запрос к API

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: promptUser }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        console.error('[DeepSeek API Error]', err);
        throw new Error(`DeepSeek API Error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      try {
        return JSON.parse(content);
      } catch (e) {
        console.error('Failed to parse DeepSeek JSON:', content);
        throw new Error('Invalid JSON from DeepSeek');
      }
    };

    // Парсим ответ нейросети
    let parsed = await requestDeepSeek(systemPrompt, userPrompt);
    let parsedBase = parsed.canonical_phrase || parsed.phrase || parsed.base || parsed.word || word;
    let collapsedPhrase = mode === 'phrase' && /\s/.test(normalizedInput) && !/\s/.test(String(parsedBase).trim());

    if (collapsedPhrase) {
      console.warn(`[DeepSeek] Phrase collapsed to first word, retrying as full phrase: "${word}" -> "${parsedBase}"`);
      parsed = await requestDeepSeek(
        phraseSystemPrompt,
        `The previous answer incorrectly collapsed the phrase to one word. Return JSON for the FULL Czech phrase only. Preserve every meaningful token, names and modifiers. If the phrase is inflected, lemmatize the whole phrase. Input phrase: "${word}"`
      );
      parsedBase = parsed.canonical_phrase || parsed.phrase || parsed.base || parsed.word || word;
      collapsedPhrase = mode === 'phrase' && /\s/.test(normalizedInput) && !/\s/.test(String(parsedBase).trim());
    }

    if (collapsedPhrase) {
      throw new Error(`Phrase analysis collapsed to a single word: ${parsedBase}`);
    }

    const unrelatedPhrase = mode === 'phrase' &&
      /\s/.test(normalizedInput) &&
      /\s/.test(String(parsedBase).trim()) &&
      !isRelatedPhrase(normalizedInput, String(parsedBase));

    if (unrelatedPhrase) {
      throw new Error(`Phrase analysis returned unrelated phrase: ${parsedBase}`);
    }

    const safeBase = collapsedPhrase
      ? normalizedInput
      : parsedBase;

    // Формируем результат с гарантированными полями
    const result = {
      // Основные поля
      word: safeBase,
      word_normalized: String(safeBase).toLowerCase(),
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
      mode,
      timestamp: new Date().toISOString()
    };

    console.log(`[DeepSeek] Result for "${word}" (${mode}): base=${result.word}, ipa=${result.ipa}, vzor=${result.vzor}, ua=${result.translations_ua.length}`);

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

function phraseTokens(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2);
}

function isRelatedPhrase(input, output) {
  const inputTokens = new Set(phraseTokens(input));
  const outputTokens = new Set(phraseTokens(output));
  if (inputTokens.size === 0 || outputTokens.size === 0) return false;

  let common = 0;
  for (const token of inputTokens) {
    if (outputTokens.has(token)) common += 1;
  }

  if (common === 0) return false;

  const minSize = Math.min(inputTokens.size, outputTokens.size);
  return common >= Math.min(2, minSize) || common / minSize >= 0.5;
}
