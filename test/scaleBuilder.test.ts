import { describe, expect, it } from 'vitest';
import { cleanMultipliers } from '../src/core/streak';
import { BEND_PROMPTS, GRADE_BASE, scoreGrade } from '../src/core/bend';
import { modeById, MODES, starsScaleBuild } from '../src/core/modes';
import { cellMidi, NECK_SIZES, pc, STANDARD_TUNING as T } from '../src/core/music';
import { Rng } from '../src/core/rng';
import { NO_STREAK } from '../src/core/streak';
import {
  BUILD_LEVELS,
  BUILDER_SCALE_IDS,
  BUILDER_SCALES,
  builderScale,
  GAP_CHOICES,
  makeScaleRun,
  rootCells,
  scaleGaps,
  scaleShape,
  spellScale,
} from '../src/core/scaleBuilder';

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL: Record<string, number> = { '': 0, '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2 };
const pitchOf = (name: string) => pc(NAMES[name[0]] + ACCIDENTAL[name.slice(1)]);

describe('scale builder scales', () => {
  it('span an octave in steps the game can ask for', () => {
    for (const s of BUILDER_SCALES) {
      const gaps = scaleGaps(s);
      expect(gaps.reduce((a, b) => a + b, 0)).toBe(12);
      for (const g of gaps) expect(GAP_CHOICES as readonly number[]).toContain(g);
      expect(s.letters.length).toBe(s.steps.length);
    }
    expect(scaleGaps(builderScale('major'))).toEqual([2, 2, 1, 2, 2, 2, 1]);
    expect(scaleGaps(builderScale('blues'))).toEqual([3, 2, 1, 1, 3, 2]);
  });

  it('are spelled as key signatures spell them', () => {
    expect(spellScale(builderScale('major'), 0)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(spellScale(builderScale('major'), 5)).toEqual(['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
    expect(spellScale(builderScale('major'), 1)).toEqual(['D♭', 'E♭', 'F', 'G♭', 'A♭', 'B♭', 'C']);
    expect(spellScale(builderScale('dorian'), 2)).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(spellScale(builderScale('harmonic'), 9)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G♯']);
    expect(spellScale(builderScale('blues'), 9)).toEqual(['A', 'C', 'D', 'E♭', 'E', 'G']);
    expect(spellScale(builderScale('minorpent'), 4)).toEqual(['E', 'G', 'A', 'B', 'D']);
    expect(spellScale(builderScale('blues'), 10)).toEqual(['B♭', 'D♭', 'E♭', 'F♭', 'F', 'A♭']);
    expect(spellScale(builderScale('minorpent'), 10)[0]).toBe('B♭');
  });

  it('spell every key with the right pitches, and seven-note scales with each letter once', () => {
    for (const s of BUILDER_SCALES) {
      for (let root = 0; root < 12; root++) {
        const names = spellScale(s, root);
        names.forEach((name, i) => expect(pitchOf(name)).toBe(pc(root + s.steps[i])));
        if (s.steps.length === 7) expect(new Set(names.map((n) => n[0])).size).toBe(7);
      }
    }
  });
});

describe('scale builder shape', () => {
  it('finds a root on the low strings for every key, on every neck', () => {
    for (const frets of NECK_SIZES) for (let root = 0; root < 12; root++) expect(rootCells(T, root, frets).length).toBeGreaterThan(0);
  });

  it('plays the scale root to octave, in one position on the neck', () => {
    for (const s of BUILDER_SCALES) {
      for (const frets of NECK_SIZES) {
        for (let root = 0; root < 12; root++) {
          for (const cell of rootCells(T, root, frets)) {
            const cells = scaleShape(T, s, cell);
            const midis = cells.map((c) => cellMidi(T, c));
            expect(midis).toEqual([...s.steps, 12].map((st) => midis[0] + st));
            for (const c of cells) {
              expect(c.fret).toBeGreaterThanOrEqual(Math.max(1, cell.fret - 1));
              expect(c.fret).toBeLessThanOrEqual(Math.min(frets, cell.fret + 3));
            }
          }
        }
      }
    }
  });
});

describe('a scale builder run', () => {
  it('goes up to the octave and back down, a note at a time', () => {
    const rng = new Rng(11);
    for (const id of BUILDER_SCALE_IDS) {
      for (let i = 0; i < 40; i++) {
        const run = makeScaleRun(rng, T, id, 12, () => 0.8);
        const n = builderScale(id).steps.length;
        expect(run.names.length).toBe(n + 1);
        expect(run.names[0]).toBe(run.names[n]);
        expect(run.placements.length).toBe(2 * n);
        expect(run.placements.slice(0, n).every((p) => p.direction === 'up' && p.to === p.from + 1)).toBe(true);
        expect(run.placements.slice(n).every((p) => p.direction === 'down' && p.to === p.from - 1)).toBe(true);
        expect(run.placements.at(-1)!.to).toBe(0);
        for (const p of run.placements) expect(p.semis).toBe(Math.abs(run.midis[p.to] - run.midis[p.from]));
      }
    }
  });

  it('scores a perfect run like any other bend game, about 100k', () => {
    for (const id of BUILDER_SCALE_IDS) {
      const placements = builderScale(id).steps.length * 2;
      let streak = NO_STREAK;
      let total = 0;
      for (let i = 0; i < placements; i++) {
        const s = scoreGrade('bullseye', streak, placements);
        total += s.points;
        streak = s.streak;
      }
      expect(Math.abs(total - GRADE_BASE.bullseye * cleanMultipliers(BEND_PROMPTS))).toBeLessThan(100);
    }
  });

  it('takes a star for each step named wrong', () => {
    expect(starsScaleBuild(5)).toBe(3);
    expect(starsScaleBuild(5, 1)).toBe(2);
    expect(starsScaleBuild(25, 1)).toBe(0);
    expect(starsScaleBuild(5, 9)).toBe(0);
  });

  it('has a table for each scale and level, off the tour', () => {
    const modes = MODES.filter((m) => m.title === 'Scale Builder');
    expect(modes.length).toBe(BUILDER_SCALES.length * BUILD_LEVELS.length);
    expect(modes.every((m) => m.offTour)).toBe(true);
    expect(modeById('scales-hard-blues')!.route).toBe('/play/scales/hard/blues');
  });
});
