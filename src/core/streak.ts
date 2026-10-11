// The streak every point-scored game carries: a run of good answers, and the
// multiplier it gives. Each answer is scored at the multiplier it found, and
// only then moves it: up a quarter for a clean one, a tenth for one that was
// only near, and back to ×1 for a miss.

/** What a clean answer (a green bend, a chord with no wrong rake) adds to the multiplier. */
export const GREEN_STEP = 0.25;
/** What an answer that was only near (a tan bend) adds. */
export const OK_STEP = 0.1;

export interface Streak {
  /** Good answers in a row. */
  run: number;
  /** What the next answer is multiplied by. */
  mult: number;
}

export type Step = 'green' | 'ok' | 'miss';

export const NO_STREAK: Streak = { run: 0, mult: 1 };

export function stepStreak(streak: Streak, step: Step): Streak {
  if (step === 'miss') return NO_STREAK;
  const add = step === 'green' ? GREEN_STEP : OK_STEP;
  return { run: streak.run + 1, mult: Math.round((streak.mult + add) * 100) / 100 };
}

/** The most the multiplier can reach over `answers` answers: every one clean, the last scored at it. */
export function topMultiplier(answers: number): number {
  return 1 + GREEN_STEP * Math.max(0, answers - 1);
}

/** The sum of the multipliers a run of `answers` clean answers is scored at. */
export function cleanMultipliers(answers: number): number {
  return answers + (GREEN_STEP * answers * (answers - 1)) / 2;
}

/** "×1.25", "×1.5", "×2". */
export function formatMultiplier(mult: number): string {
  return `×${Number(mult.toFixed(2))}`;
}
