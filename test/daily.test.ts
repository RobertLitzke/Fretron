import { describe, expect, it } from 'vitest';
import { dailyPick, dayKey, dayNumber, dayWords } from '../src/core/daily';

describe('the daily run', () => {
  it('counts days from the start of 2026', () => {
    expect(dayNumber('2026-01-01')).toBe(0);
    expect(dayNumber('2026-11-04')).toBe(307);
    expect(dayNumber('nonsense')).toBeNaN();
  });

  it('keys a date in local time', () => {
    expect(dayKey(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(dayWords('2026-11-04')).toBe('4 Nov 2026');
  });

  it('draws the same game and seed for the same day, and spreads days over the games', () => {
    const a = dailyPick('2026-11-04', 17);
    expect(dailyPick('2026-11-04', 17)).toEqual(a);
    expect(a.index).toBeGreaterThanOrEqual(0);
    expect(a.index).toBeLessThan(17);
    const seen = new Set<number>();
    for (let d = 0; d < 60; d++) seen.add(dailyPick(`2026-03-${String((d % 28) + 1).padStart(2, '0')}`, 17).index);
    expect(seen.size).toBeGreaterThan(8);
    expect(dailyPick('2026-11-05', 17).seed).not.toBe(a.seed);
  });
});
