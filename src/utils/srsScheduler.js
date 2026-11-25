/**
 * Чистый планировщик интервального повторения SRS (SM-2).
 * 1:1 паритет с Android SrsScheduler.kt.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 180;

export const SRS_RATING = {
  AGAIN: 'AGAIN',
  HARD: 'HARD',
  GOOD: 'GOOD'
};

export function scheduleSrs(
  rating,
  currentIntervalDays = 0,
  currentEaseFactor = 2.5,
  currentRepetitions = 0,
  nowMillis = Date.now()
) {
  const safeEase =
    currentEaseFactor >= MIN_EASE && currentEaseFactor <= MAX_EASE ? currentEaseFactor : 2.5;
  const safeInterval = Math.max(0, Number(currentIntervalDays) || 0);
  const safeReps = Math.max(0, Number(currentRepetitions) || 0);

  if (rating === SRS_RATING.AGAIN) {
    return {
      nextReviewAt: nowMillis,
      intervalDays: 0,
      easeFactor: Math.max(MIN_EASE, Number((safeEase - 0.2).toFixed(2))),
      repetitions: 0
    };
  }

  if (rating === SRS_RATING.HARD) {
    const nextInterval =
      safeInterval <= 1
        ? 1
        : Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(safeInterval * 1.2)));
    return {
      nextReviewAt: nowMillis + nextInterval * DAY_MS,
      intervalDays: nextInterval,
      easeFactor: Math.max(MIN_EASE, Number((safeEase - 0.15).toFixed(2))),
      repetitions: Math.max(1, safeReps)
    };
  }

  // GOOD
  let nextInterval;
  if (safeReps === 0) nextInterval = 1;
  else if (safeReps === 1) nextInterval = 3;
  else {
    nextInterval = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(safeInterval + 1, Math.round(Math.max(safeInterval, 3) * safeEase))
    );
  }

  return {
    nextReviewAt: nowMillis + nextInterval * DAY_MS,
    intervalDays: nextInterval,
    easeFactor: Math.min(MAX_EASE, Number((safeEase + 0.05).toFixed(2))),
    repetitions: safeReps + 1
  };
}
