// Scale Bends: a bend from one note of a scale up to another, with the scale
// drawn around it. The point is to learn where the bends sit in a shape (the
// 4 to the 5, the ♭7 to the root) as well as the notes of the shape itself.

import { semitoneTravel, type BendPrompt } from './bend';
import { cellMidi, pc, type Cell, type Tuning } from './music';
import type { Rng } from './rng';

export type ScaleId = 'blues' | 'major' | 'minor';
export const SCALE_IDS: readonly ScaleId[] = ['blues', 'major', 'minor'];

export interface Scale {
  id: ScaleId;
  /** "Minor pentatonic + ♭5": how the call names it after the root. */
  name: string;
  /** Semitones above the root, lowest first. */
  steps: readonly number[];
  /** How each step is written, in the same order. */
  degrees: readonly string[];
  /** A step that is passed over on the way to the next one: the blue note, bent through. */
  passing?: number;
}

export const SCALES: Record<ScaleId, Scale> = {
  blues: {
    id: 'blues',
    name: 'minor pentatonic + ♭5',
    steps: [0, 3, 5, 6, 7, 10],
    degrees: ['R', '♭3', '4', '♭5', '5', '♭7'],
    passing: 6,
  },
  major: { id: 'major', name: 'major', steps: [0, 2, 4, 5, 7, 9, 11], degrees: ['R', '2', '3', '4', '5', '6', '7'] },
  minor: { id: 'minor', name: 'natural minor', steps: [0, 2, 3, 5, 7, 8, 10], degrees: ['R', '2', '♭3', '4', '5', '♭6', '♭7'] },
};

export function asScale(text: string): ScaleId {
  return (SCALE_IDS as readonly string[]).includes(text) ? (text as ScaleId) : 'blues';
}

/** The degree a pitch has in a scale on `root`, or null if it is not in it. */
export function degreeOf(scale: Scale, root: number, midi: number): string | null {
  const i = scale.steps.indexOf(pc(midi - root));
  return i < 0 ? null : scale.degrees[i];
}

/**
 * The bends a scale offers, as [from, to] in semitones above the root: each
 * step up to the next, and over the blue note to the one after it (the 4 to
 * the 5). Nothing wider than a step and a half.
 */
export function scaleBends(scale: Scale): [number, number][] {
  const out: [number, number][] = [];
  const s = scale.steps;
  for (let i = 0; i < s.length; i++) {
    const next = (k: number) => s[(i + k) % s.length] + (i + k >= s.length ? 12 : 0);
    out.push([s[i], next(1)]);
    if (scale.passing !== undefined && pc(next(1)) === scale.passing) out.push([s[i], next(2)]);
  }
  return out.filter(([a, b]) => b - a <= 3);
}

/** Whole-step bends are the everyday ones; half steps and step-and-a-half less so. */
const SEMIS_WEIGHT: Record<number, number> = { 1: 2, 2: 3, 3: 1 };

const FIRST_FRET = 5;
const LAST_FRET = 17;
/**
 * Frets kept clear at the body end of the neck for the note being bent: the
 * held, bent note is drawn larger and glows, and at the very edge of the board
 * it has no room.
 */
export const EDGE_FRETS = 1;

export interface ScaleBendPrompt extends BendPrompt {
  scale: ScaleId;
  /** Pitch class of the root. */
  root: number;
  /** Where the note the bend should reach is fretted: see targetCell. */
  target: Cell;
}

/** Up to a whole step the target is shown on the bend's own string, where it sits beside the note being bent. */
const SAME_STRING_SEMIS = 2;

/**
 * Where the pitch a bend should reach is fretted. Up to a whole step it is on
 * the bend's own string, `semis` frets up, while that is still on the neck.
 * A wider bend, or one whose target would be off the end of the neck, has it
 * on the next string up instead, where it lies in the scale shape; the top
 * string has none above it and keeps its own.
 */
export function targetCell(tuning: Tuning, cell: Cell, semis: number, frets: number): Cell {
  const same = { string: cell.string, fret: cell.fret + semis };
  if (semis <= SAME_STRING_SEMIS && same.fret <= frets) return same;
  const up = cell.string + 1;
  if (up < tuning.open.length) {
    const fret = cell.fret + semis - (tuning.open[up] - tuning.open[cell.string]);
    if (fret >= 1) return { string: up, fret };
  }
  return same;
}

export interface ScaleBendOption {
  cell: Cell;
  semis: number;
  target: Cell;
  weight: number;
}

/**
 * Every bend a key offers on a neck of `frets` frets, and how likely each is:
 * mostly on the three high strings, and only there for a step and a half.
 * The note being bent keeps EDGE_FRETS clear of the end of the neck, and its
 * target is on the neck too.
 */
export function scaleBendOptions(tuning: Tuning, scale: Scale, root: number, frets: number): ScaleBendOption[] {
  const bends = scaleBends(scale);
  const top = tuning.open.length - 1;
  const last = Math.min(LAST_FRET, frets - EDGE_FRETS);
  const options: ScaleBendOption[] = [];
  for (let string = 0; string <= top; string++) {
    const fromTop = top - string;
    for (let fret = FIRST_FRET; fret <= last; fret++) {
      const at = pc(tuning.open[string] + fret - root);
      for (const [from, to] of bends) {
        const semis = to - from;
        if (from !== at) continue;
        const target = targetCell(tuning, { string, fret }, semis, frets);
        if (target.fret < 1 || target.fret > frets) continue;
        const stringWeight = semis >= 3 ? (fromTop <= 2 ? 3 : 0) : fromTop <= 2 ? 4 : fromTop === 3 ? 2 : 1;
        if (stringWeight) options.push({ cell: { string, fret }, semis, target, weight: stringWeight * SEMIS_WEIGHT[semis] });
      }
    }
  }
  return options;
}

/** A key, then one of the bends it offers on this neck (scaleBendOptions). */
export function makeScaleBendPrompt(rng: Rng, tuning: Tuning, scaleId: ScaleId, frets: number): ScaleBendPrompt {
  const root = rng.int(12);
  const options = scaleBendOptions(tuning, SCALES[scaleId], root, frets);
  const { cell, semis, target } = options[rng.weighted(options.map((o) => o.weight))];
  const from = cellMidi(tuning, cell);
  return {
    cell,
    travel: semitoneTravel(rng, tuning, cell),
    semis,
    from,
    to: from + semis,
    scale: scaleId,
    root,
    target,
  };
}

/** The scale's notes in a span of frets around the bend: the shape it sits in. */
export function scaleCells(tuning: Tuning, scale: Scale, root: number, first: number, last: number): Cell[] {
  const out: Cell[] = [];
  for (let string = 0; string < tuning.open.length; string++) {
    for (let fret = Math.max(1, first); fret <= last; fret++) {
      if (degreeOf(scale, root, tuning.open[string] + fret) !== null) out.push({ string, fret });
    }
  }
  return out;
}
