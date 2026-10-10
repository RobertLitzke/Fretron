import { describe, expect, it } from 'vitest';
import { cellMidi, pc, STANDARD_TUNING as T } from '../src/core/music';
import { Rng } from '../src/core/rng';
import { degreeOf, makeScaleBendPrompt, SCALE_IDS, SCALES, scaleBends, scaleCells, targetCell } from '../src/core/scaleBend';

describe('scale bends', () => {
  it('offers the blues bends, the 4 to the 5 over the blue note among them', () => {
    expect(scaleBends(SCALES.blues)).toEqual([
      [0, 3],
      [3, 5],
      [5, 6],
      [5, 7],
      [6, 7],
      [7, 10],
      [10, 12],
    ]);
    expect(scaleBends(SCALES.major).every(([a, b]) => b - a <= 2)).toBe(true);
  });

  it('bends from a scale note to the next one, whose target is fretted on the neck', () => {
    for (const id of SCALE_IDS) {
      const rng = new Rng(7);
      for (let i = 0; i < 300; i++) {
        const p = makeScaleBendPrompt(rng, T, id, 12);
        expect(degreeOf(SCALES[id], p.root, p.from)).not.toBeNull();
        expect(degreeOf(SCALES[id], p.root, p.to)).not.toBeNull();
        expect(p.to - p.from).toBe(p.semis);
        const wraps = p.semis > 2 || p.cell.fret + p.semis > 12;
        if (wraps && p.cell.string < 5) expect(p.target.string).toBe(p.cell.string + 1);
        else expect(p.target).toEqual({ string: p.cell.string, fret: p.cell.fret + p.semis });
        expect(cellMidi(T, p.target)).toBe(p.to);
        expect(p.target.fret).toBeLessThanOrEqual(12);
        expect(p.cell.fret).toBeGreaterThanOrEqual(5);
        if (p.semis === 3) expect(p.cell.string).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('bends mostly on the three high strings', () => {
    const rng = new Rng(3);
    let high = 0;
    for (let i = 0; i < 1000; i++) if (makeScaleBendPrompt(rng, T, 'blues', 17).cell.string >= 3) high++;
    expect(high).toBeGreaterThan(700);
  });

  it('shows the target on the same string up to a whole step, and on the next string up beyond that or past the neck', () => {
    // Half and whole steps that fit stay on their own string.
    expect(targetCell(T, { string: 4, fret: 8 }, 1, 12)).toEqual({ string: 4, fret: 9 });
    expect(targetCell(T, { string: 4, fret: 8 }, 2, 12)).toEqual({ string: 4, fret: 10 });
    // A on the B string at fret 10, bent a whole step on a 12-fret neck: fret 12 still fits.
    expect(targetCell(T, { string: 4, fret: 10 }, 2, 12)).toEqual({ string: 4, fret: 12 });
    // At fret 11 it would be off the neck: B, on the high E string at fret 8.
    expect(targetCell(T, { string: 4, fret: 11 }, 2, 12)).toEqual({ string: 5, fret: 8 });
    // On a longer neck it fits again.
    expect(targetCell(T, { string: 4, fret: 11 }, 2, 15)).toEqual({ string: 4, fret: 13 });
    // A step and a half goes up a string: D on the G string to F on the B string (a third apart), fret 6.
    expect(targetCell(T, { string: 3, fret: 7 }, 3, 12)).toEqual({ string: 4, fret: 6 });
    // The top string has none above it.
    expect(targetCell(T, { string: 5, fret: 8 }, 3, 12)).toEqual({ string: 5, fret: 11 });
  });

  it('draws only scale notes', () => {
    const cells = scaleCells(T, SCALES.minor, 9, 3, 9);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => [9, 11, 0, 2, 4, 5, 7].includes(pc(cellMidi(T, c))))).toBe(true);
  });
});
