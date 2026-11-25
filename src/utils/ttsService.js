/**
 * ttsService.js
 * Озвучка чешских слов и фраз:
 *   1) Google Gemini TTS через Netlify Function (/.netlify/functions/tts-google)
 *      с кэшированием Blob URL в памяти (повторный клик — 0мс и 0 запросов к API);
 *   2) Автоматический fallback на лучший доступный cs-CZ голос браузера (Web Speech API)
 *      при офлайне или недоступности сервера.
 */

const MAX_CACHE_ENTRIES = 120;

class TtsService {
  constructor() {
    this.audioCache = new Map();
    this.inFlight = new Map();
    this.currentAudio = null;
    this.playSeq = 0;
  }

  _cacheKey(text) {
    return String(text || '').normalize('NFC').trim().toLowerCase();
  }

  stop() {
    this.playSeq += 1;
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  _base64ToObjectUrl(base64, mimeType = 'audio/wav') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  _putCache(key, objectUrl) {
    if (this.audioCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.audioCache.keys().next().value;
      const oldestUrl = this.audioCache.get(oldestKey);
      this.audioCache.delete(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
    this.audioCache.set(key, objectUrl);
  }

  async _fetchGoogleAudioUrl(text, key) {
    if (this.audioCache.has(key)) {
      return this.audioCache.get(key);
    }
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      const response = await fetch('/.netlify/functions/tts-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data?.audioBase64) {
        throw new Error('Empty TTS audio response');
      }

      const url = this._base64ToObjectUrl(data.audioBase64, data.mimeType || 'audio/wav');
      this._putCache(key, url);
      return url;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  _pickBestCzechBrowserVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const czechVoices = voices.filter(v => /^cs([-_]|$)/i.test(v.lang || ''));
    if (!czechVoices.length) return null;

    // Приоритет: нейросетевые голоса (Natural / Google / Online), затем локальные
    const score = (v) => {
      const name = (v.name || '').toLowerCase();
      let s = 0;
      if (name.includes('natural')) s += 40;
      if (name.includes('google')) s += 35;
      if (name.includes('online')) s += 20;
      if (name.includes('vlasta') || name.includes('antonin') || name.includes('antonín')) s += 15;
      if (v.localService === false) s += 5;
      return s;
    };

    return [...czechVoices].sort((a, b) => score(b) - score(a))[0];
  }

  _speakWithBrowserFallback(text) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'cs-CZ';
    utterance.rate = 0.85;
    const bestVoice = this._pickBestCzechBrowserVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    window.speechSynthesis.speak(utterance);
  }

  async speak(text) {
    const clean = String(text || '').trim();
    if (!clean) return;

    this.stop();
    const seq = this.playSeq;
    const key = this._cacheKey(clean);

    try {
      const audioUrl = await this._fetchGoogleAudioUrl(clean, key);
      // Если пользователь уже нажал другое слово — отменяем устаревшее воспроизведение
      if (seq !== this.playSeq) return;

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      await audio.play();
    } catch (err) {
      if (seq !== this.playSeq) return;
      console.warn('[TTS] Google TTS unavailable, falling back to browser speechSynthesis:', err.message);
      this._speakWithBrowserFallback(clean);
    }
  }
}

export const ttsService = new TtsService();
