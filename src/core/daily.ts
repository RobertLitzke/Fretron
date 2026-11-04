// The daily run: one game a day, the same for everyone, drawn from the date.
// It is an ordinary run from a seed, so two players' runs are prompt for prompt
// the same and their scores can be compared by sharing the link.

import { hash2 } from './rng';

/** "2026-11-04", in the player's own time zone. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days since 2026-01-01 for a day key, or NaN for anything else. */
export function dayNumber(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return NaN;
  const [, y, mo, d] = m.map(Number);
  return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
}

/** Which of `count` games is the day's, and the seed its run is drawn from. */
export function dailyPick(key: string, count: number): { index: number; seed: number } {
  const day = dayNumber(key);
  return { index: hash2(day, 1) % count, seed: hash2(day, 2) };
}

/** "4 Nov 2026". */
export function dayWords(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const [, y, mo, d] = m.map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
