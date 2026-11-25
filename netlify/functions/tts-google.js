/**
 * Netlify Function для озвучки чешских слов и фраз через Google Gemini TTS
 * (gemini-3.8-flash-lite-tts с fallback на gemini-2.5-flash-preview-tts).
 *
 * Ключ берётся из переменной окружения GOOGLE_TTS_API_KEY (или GEMINI_API_KEY).
 * Всегда возвращает воспроизводимый браузером audio/wav (base64).
 */

const PRIMARY_MODEL = process.env.GOOGLE_TTS_MODEL || 'gemini-3.8-flash-lite-tts';
const FALLBACK_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = process.env.GOOGLE_TTS_VOICE || 'Kore';
const MAX_TEXT_LENGTH = 300;
const REQUEST_TIMEOUT_MS = 12000;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * Оборачивает сырой 16-bit mono PCM (audio/L16) в стандартный 44-байтный WAV-заголовок.
 */
function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function parseSampleRate(mimeType) {
  const match = String(mimeType || '').match(/rate=(\d+)/i);
  return match ? Number(match[1]) || 24000 : 24000;
}

async function synthesizeWithModel(model, text, voiceName, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text }]
          }
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode: 'cs-CZ',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini TTS (${model}) HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const inlineData = payload?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error(`Gemini TTS (${model}) returned empty audio`);
    }

    const mimeType = String(inlineData.mimeType || 'audio/wav');
    if (mimeType.toLowerCase().includes('wav') || mimeType.toLowerCase().includes('mpeg') || mimeType.toLowerCase().includes('mp3')) {
      return {
        audioBase64: inlineData.data,
        mimeType: mimeType.split(';')[0].trim(),
        model
      };
    }

    // Если пришёл сырой PCM (audio/L16;codec=pcm;rate=24000) — упаковываем в WAV
    const pcmBuffer = Buffer.from(inlineData.data, 'base64');
    const wavBuffer = pcmToWavBuffer(pcmBuffer, parseSampleRate(mimeType));
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav',
      model
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = (process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'GOOGLE_TTS_API_KEY not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const text = String(body.text || '').trim();
    const voiceName = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : DEFAULT_VOICE;

    if (!text) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Text is required' })
      };
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Text exceeds ${MAX_TEXT_LENGTH} characters` })
      };
    }

    let result;
    try {
      result = await synthesizeWithModel(PRIMARY_MODEL, text, voiceName, apiKey);
    } catch (primaryErr) {
      console.warn(`[Google TTS] Primary model ${PRIMARY_MODEL} failed, trying ${FALLBACK_MODEL}:`, primaryErr.message);
      result = await synthesizeWithModel(FALLBACK_MODEL, text, voiceName, apiKey);
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[Google TTS] Error:', error.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || 'TTS synthesis failed' })
    };
  }
};
