/**
 * Чистые функции нормализации и сопоставления слов/фраз.
 * Полный паритет с Android WordMatcher.kt.
 */

const INVALID_FIREBASE_KEY_RE = /[.#$[\]/]/;
const CYRILLIC_RE = /[а-яА-ЯёЁіїєґІЇЄҐ]/;

export function normalizeWord(word) {
  return String(word || '').normalize('NFC').toLowerCase().trim();
}

export function hasCyrillic(text) {
  return CYRILLIC_RE.test(String(text || ''));
}

export function isValidFirebaseKey(key) {
  return Boolean(key) && !INVALID_FIREBASE_KEY_RE.test(key);
}

export function phraseTokens(phrase) {
  return new Set(
    normalizeWord(phrase)
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 2)
  );
}

export function isRelatedPhrase(searchedPhrase, returnedPhrase) {
  const searchedTokens = phraseTokens(searchedPhrase);
  const returnedTokens = phraseTokens(returnedPhrase);
  if (searchedTokens.size === 0 || returnedTokens.size === 0) return false;

  let commonCount = 0;
  for (const token of searchedTokens) {
    if (returnedTokens.has(token)) commonCount += 1;
  }
  if (commonCount === 0) return false;

  const minTokenCount = Math.min(searchedTokens.size, returnedTokens.size);
  return commonCount >= Math.min(2, minTokenCount) || commonCount / minTokenCount >= 0.5;
}

export function isValidMatch(searchedWord, entryWord, entryForms = []) {
  const normalizedSearched = normalizeWord(searchedWord);
  const returnedWord = normalizeWord(entryWord);
  if (!normalizedSearched || !returnedWord) return false;
  if (normalizedSearched === returnedWord) return true;

  const formsList = Array.isArray(entryForms) ? entryForms : [];

  if (normalizedSearched.includes(' ') && returnedWord.includes(' ')) {
    return (
      isRelatedPhrase(normalizedSearched, returnedWord) ||
      formsList.some(f => normalizeWord(f) === normalizedSearched)
    );
  }

  return formsList.some(f => normalizeWord(f) === normalizedSearched);
}
