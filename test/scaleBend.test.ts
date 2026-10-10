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
        if (p.semis >= 2 && p.cell.string < 5) expect(p.target.string).toBe(p.cell.string + 1);
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

  it('shows the target of a whole step or more on the next string up', () => {
    // A on the B string, bent a whole step: B, on the high E string at fret 7.
    expect(targetCell(T, { string: 4, fret: 10 }, 2)).toEqual({ string: 5, fret: 7 });
    // The G to B strings are a third apart: D bent a step and a half to F, at fret 6.
    expect(targetCell(T, { string: 3, fret: 7 }, 3)).toEqual({ string: 4, fret: 6 });
    // A half step, or the top string, stays on its own string.
    expect(targetCell(T, { string: 4, fret: 10 }, 1)).toEqual({ string: 4, fret: 11 });
    expect(targetCell(T, { string: 5, fret: 10 }, 2)).toEqual({ string: 5, fret: 12 });
  });

  it('draws only scale notes', () => {
    const cells = scaleCells(T, SCALES.minor, 9, 3, 9);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => [9, 11, 0, 2, 4, 5, 7].includes(pc(cellMidi(T, c))))).toBe(true);
  });
});
