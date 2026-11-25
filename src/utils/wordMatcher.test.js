import { normalizeWord, hasCyrillic, isValidFirebaseKey, isRelatedPhrase, isValidMatch } from './wordMatcher';
import { getVazbaTheory } from './vazbaTheory';
import { scheduleSrs, SRS_RATING, DAY_MS } from './srsScheduler';

describe('wordMatcher', () => {
  test('normalizeWord applies NFC, lowercase and trim', () => {
    const precomposed = 'č';
    const decomposed = 'c\u030C';
    expect(normalizeWord('  ŽENA  ')).toBe('žena');
    expect(normalizeWord(decomposed)).toBe(precomposed);
  });

  test('isValidFirebaseKey rejects forbidden RTDB characters', () => {
    expect(isValidFirebaseKey('žena')).toBe(true);
    expect(isValidFirebaseKey('dobrý den')).toBe(true);
    expect(isValidFirebaseKey('např.')).toBe(false);
    expect(isValidFirebaseKey('a/b')).toBe(false);
    expect(isValidFirebaseKey('a#b')).toBe(false);
    expect(isValidFirebaseKey('')).toBe(false);
  });

  test('isValidMatch accepts inflected forms and related phrases, rejects mismatches', () => {
    expect(isValidMatch('ženy', 'žena', ['žena', 'ženy', 'ženě'])).toBe(true);
    expect(isValidMatch('pes', 'žena', ['žena', 'ženy'])).toBe(false);
    expect(isValidMatch('klášteře svatého daniela', 'klášter svatého daniela', [])).toBe(true);
    expect(isValidMatch('benzín bezolovnatý', 'mateřská škola', [])).toBe(false);
    expect(isRelatedPhrase('benzín bezolovnatý', 'bezolovnatý benzín')).toBe(true);
  });

  test('hasCyrillic detects Russian and Ukrainian text', () => {
    expect(hasCyrillic('ждать')).toBe(true);
    expect(hasCyrillic('чекати')).toBe(true);
    expect(hasCyrillic('їжа')).toBe(true);
    expect(hasCyrillic('čekat')).toBe(false);
  });
});

describe('vazbaTheory', () => {
  test('resolves exact key, contains fallback, and default in RU and UA', () => {
    const ruExact = getVazbaTheory('NA + 4', 'ru');
    const uaExact = getVazbaTheory('na + 4', 'ua');
    expect(ruExact).toContain('4. pád');
    expect(uaExact).toContain('Знахідний');
    expect(ruExact).not.toBe(uaExact);

    expect(getVazbaTheory('za + 7', 'ru')).toContain('7. pád');
    expect(getVazbaTheory('unknown', 'ru')).toContain('Vazba');
  });
});

describe('srsScheduler', () => {
  const now = 1700000000000;

  test('GOOD rating progresses intervals 1 -> 3 -> growing', () => {
    const first = scheduleSrs(SRS_RATING.GOOD, 0, 2.5, 0, now);
    expect(first.intervalDays).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(first.nextReviewAt).toBe(now + DAY_MS);

    const second = scheduleSrs(SRS_RATING.GOOD, first.intervalDays, first.easeFactor, first.repetitions, now);
    expect(second.intervalDays).toBe(3);
    expect(second.repetitions).toBe(2);

    const third = scheduleSrs(SRS_RATING.GOOD, second.intervalDays, second.easeFactor, second.repetitions, now);
    expect(third.intervalDays).toBeGreaterThanOrEqual(7);
    expect(third.repetitions).toBe(3);
  });

  test('AGAIN resets interval and repetitions', () => {
    const res = scheduleSrs(SRS_RATING.AGAIN, 10, 2.5, 3, now);
    expect(res.intervalDays).toBe(0);
    expect(res.repetitions).toBe(0);
    expect(res.nextReviewAt).toBe(now);
    expect(res.easeFactor).toBeLessThan(2.5);
  });

  test('HARD schedules at least 1 day and respects ease floor', () => {
    const res = scheduleSrs(SRS_RATING.HARD, 0, 1.3, 0, now);
    expect(res.intervalDays).toBe(1);
    expect(res.repetitions).toBe(1);
    expect(res.easeFactor).toBe(1.3);
  });
});
