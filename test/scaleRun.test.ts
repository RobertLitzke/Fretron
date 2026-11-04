import { describe, expect, it } from 'vitest';
import { cellMidi, pc, STANDARD_TUNING as T } from '../src/core/music';
import { Rng } from '../src/core/rng';
import { builderScale } from '../src/core/scaleBuilder';
import { gradeTap, makeRunRound, ROUND_BPM, runOrder, runTaps, scoreTap } from '../src/core/scaleRun';
import { NO_STREAK } from '../src/core/streak';

describe('Scale Run', () => {
  it('goes up to the octave and back down', () => {
    expect(runOrder(5)).toEqual([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
    expect(runTaps(7)).toBe(ROUND_BPM.length * 15);
  });

  it('grades a tap by its distance from the beat', () => {
    expect(gradeTap(0)).toBe('bullseye');
    expect(gradeTap(-49)).toBe('bullseye');
    expect(gradeTap(80)).toBe('intune');
    expect(gradeTap(-150)).toBe('acceptable');
    expect(gradeTap(300)).toBe('off');
  });

  it('draws the scale in a position, and a new one next round', () => {
    const rng = new Rng(4);
    const first = makeRunRound(rng, T, 'minorpent', 9, 12, 72, null);
    expect(first.cells).toHaveLength(6);
    expect(pc(cellMidi(T, first.cells[0]))).toBe(9);
    expect(cellMidi(T, first.cells[5]) - cellMidi(T, first.cells[0])).toBe(12);
    const steps = builderScale('minorpent').steps;
    first.cells.forEach((c, i) => expect(cellMidi(T, c) - cellMidi(T, first.cells[0])).toBe(i < 5 ? steps[i] : 12));
    expect(first.names[0]).toBe('A');
    expect(first.names.at(-1)).toBe('A');
    const second = makeRunRound(rng, T, 'minorpent', 9, 12, 92, first.cells[0]);
    expect(second.cells[0]).not.toEqual(first.cells[0]);
  });

  it('comes to about 100k for a run on the beat', () => {
    const taps = runTaps(7);
    let streak = NO_STREAK;
    let points = 0;
    for (let i = 0; i < taps; i++) {
      const scored = scoreTap('bullseye', streak, taps);
      points += scored.points;
      streak = scored.streak;
    }
    expect(points).toBeGreaterThan(95000);
    expect(points).toBeLessThan(105000);
  });
});
