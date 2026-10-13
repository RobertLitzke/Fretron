// Scale Builder: a scale is chosen, the game picks a key and plays its root,
// and the player builds the scale by ear, a note at a time, up to the octave
// and back down. Each note is pushed to pitch from the one before it, as a
// bend on the way up and a dip (a whammy bar's) on the way down, with nothing
// played first to match: the scale has to be heard from the inside.
//
// Easy shows the notes and the steps between them. Hard shows only the notes:
// on the way up each step has to be named (half, whole, or a step and a half)
// before it is played.

import { cellMidi, pc, type Cell, type Tuning } from './music';
import type { Rng } from './rng';

export type BuilderScaleId =
  | 'major'
  | 'minor'
  | 'harmonic'
  | 'melodic'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'majorpent'
  | 'minorpent'
  | 'blues';

export interface BuilderScale {
  id: BuilderScaleId;
  /** "Harmonic minor": on the menu, and after the key in a run. */
  name: string;
  /** Semitones above the root, lowest first; the octave is not repeated. */
  steps: readonly number[];
  /** The letter each step is written with, counted from the root's: the ♭5 of the blues is a 5th, not a ♯4. */
  letters: readonly number[];
  /** The seven-note scale whose key signature it is written in, where it has fewer notes. */
  parent?: BuilderScaleId;
}

const scale = (id: BuilderScaleId, name: string, steps: number[], letters = [0, 1, 2, 3, 4, 5, 6], parent?: BuilderScaleId): BuilderScale => ({
  id,
  name,
  steps,
  letters,
  parent,
});

export const BUILDER_SCALES: readonly BuilderScale[] = [
  scale('major', 'Major', [0, 2, 4, 5, 7, 9, 11]),
  scale('minor', 'Natural minor', [0, 2, 3, 5, 7, 8, 10]),
  scale('harmonic', 'Harmonic minor', [0, 2, 3, 5, 7, 8, 11]),
  scale('melodic', 'Melodic minor', [0, 2, 3, 5, 7, 9, 11]),
  scale('dorian', 'Dorian', [0, 2, 3, 5, 7, 9, 10]),
  scale('phrygian', 'Phrygian', [0, 1, 3, 5, 7, 8, 10]),
  scale('lydian', 'Lydian', [0, 2, 4, 6, 7, 9, 11]),
  scale('mixolydian', 'Mixolydian', [0, 2, 4, 5, 7, 9, 10]),
  scale('locrian', 'Locrian', [0, 1, 3, 5, 6, 8, 10]),
  scale('majorpent', 'Major pentatonic', [0, 2, 4, 7, 9], [0, 1, 2, 4, 5], 'major'),
  scale('minorpent', 'Minor pentatonic', [0, 3, 5, 7, 10], [0, 2, 3, 4, 6], 'minor'),
  scale('blues', 'Blues', [0, 3, 5, 6, 7, 10], [0, 2, 3, 4, 4, 6], 'minor'),
];

export const BUILDER_SCALE_IDS: readonly BuilderScaleId[] = BUILDER_SCALES.map((s) => s.id);

export function builderScale(id: BuilderScaleId): BuilderScale {
  return BUILDER_SCALES.find((s) => s.id === id)!;
}

export function asBuilderScale(text: string): BuilderScaleId {
  return (BUILDER_SCALE_IDS as readonly string[]).includes(text) ? (text as BuilderScaleId) : 'major';
}

export type BuildLevel = 'easy' | 'hard';
export const BUILD_LEVELS: readonly BuildLevel[] = ['easy', 'hard'];

export function asBuildLevel(text: string): BuildLevel {
  return text === 'hard' ? 'hard' : 'easy';
}

/** The semitones from each note of the scale to the next, the last to the octave. */
export function scaleGaps(s: BuilderScale): number[] {
  return s.steps.map((step, i) => (s.steps[i + 1] ?? 12) - step);
}

/** The steps a hard run asks the player to name: a half step, a whole step, a step and a half. */
export const GAP_CHOICES = [1, 2, 3] as const;

// --- spelling ----------------------------------------------------------------

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11] as const;
const MARKS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** How far `target` is above `from`, as the nearest of -6 to +5 semitones. */
function nearest(from: number, target: number): number {
  const d = pc(target - from);
  return d > 5 ? d - 12 : d;
}

/** The scale's notes on a root, written so each takes the letter its degree calls for. */
function spellOn(s: BuilderScale, root: number, rootLetter: number): { names: string[]; cost: number } | null {
  const names: string[] = [];
  let cost = 0;
  for (let i = 0; i < s.steps.length; i++) {
    const letter = (rootLetter + s.letters[i]) % 7;
    const accidental = nearest(NATURAL[letter], root + s.steps[i]);
    if (Math.abs(accidental) > 2) return null;
    names.push(LETTERS[letter] + MARKS[accidental]);
    // A double sharp or flat counts for more than two single ones.
    cost += Math.abs(accidental) === 2 ? 5 : Math.abs(accidental);
  }
  return { names, cost };
}

/**
 * The scale's notes on root pitch class `root`, root first, spelled as a key
 * signature would have them: of the root's two names, the one whose key needs
 * fewer sharps and flats (D♭ major, not C♯ major; B♭ blues, not A♯). A
 * pentatonic is judged by the key it comes from.
 */
export function spellScale(s: BuilderScale, root: number): string[] {
  const judge = s.parent ? builderScale(s.parent) : s;
  let best: { names: string[]; cost: number } | null = null;
  for (let letter = 0; letter < 7; letter++) {
    if (Math.abs(nearest(NATURAL[letter], root)) > 1) continue;
    const spelled = spellOn(s, root, letter);
    const key = spellOn(judge, root, letter);
    if (!spelled || !key) continue;
    if (!best || key.cost < best.cost) best = { names: spelled.names, cost: key.cost };
  }
  return best!.names;
}

// --- the shape ---------------------------------------------------------------

/** Frets a position reaches below the root's, and above it. */
const REACH_BELOW = 1;
const REACH_ABOVE = 3;
/** The strings a run's root can be on: the three lowest, so the octave fits above it. */
const ROOT_STRINGS = 3;

/**
 * Where an octave of the scale is played from a root at `rootCell`, root to
 * octave: in one position, a fret below the root to three above, each note on
 * the lowest string it fits on from the last note's string up.
 */
export function scaleShape(tuning: Tuning, s: BuilderScale, rootCell: Cell): Cell[] {
  const lo = rootCell.fret - REACH_BELOW;
  const hi = rootCell.fret + REACH_ABOVE;
  const rootMidi = cellMidi(tuning, rootCell);
  const cells: Cell[] = [];
  let string = rootCell.string;
  for (const step of [...s.steps, 12]) {
    const midi = rootMidi + step;
    while (string < tuning.open.length && midi - tuning.open[string] > hi) string++;
    const fret = midi - tuning.open[string];
    if (string >= tuning.open.length || fret < lo) throw new Error('no position for the scale');
    cells.push({ string, fret });
  }
  return cells;
}

/** Every place a run on root pitch class `root` can start from, on a neck of `frets` frets. */
export function rootCells(tuning: Tuning, root: number, frets: number): Cell[] {
  const out: Cell[] = [];
  for (let string = 0; string < ROOT_STRINGS; string++) {
    for (let fret = 1 + REACH_BELOW; fret + REACH_ABOVE <= frets; fret++) {
      if (pc(tuning.open[string] + fret) === pc(root)) out.push({ string, fret });
    }
  }
  return out;
}

// --- a run -------------------------------------------------------------------

/** One note to place: from the note before it to this one, up or down. */
export interface Placement {
  /** Index in the shape of the note the push starts from, and of the note it should reach. */
  from: number;
  to: number;
  direction: 'up' | 'down';
  /** Semitones between them. */
  semis: number;
  /** A semitone's push for this placement, in gaps between strings: see core/bend.ts. */
  travel: number;
}

export interface ScaleRun {
  scale: BuilderScaleId;
  /** Pitch class of the root. */
  root: number;
  /** Root to octave, spelled. */
  names: string[];
  /** Root to octave, on the neck. */
  cells: Cell[];
  /** Root to octave, as pitches. */
  midis: number[];
  /** Up to the octave, then back down to the root. */
  placements: Placement[];
}

/** A semitone of push at a cell, as core/bend.ts reckons it, a little different every time. */
export type TravelAt = (cell: Cell) => number;

export function makeScaleRun(rng: Rng, tuning: Tuning, scaleId: BuilderScaleId, frets: number, travelAt: TravelAt): ScaleRun {
  const s = builderScale(scaleId);
  const root = rng.int(12);
  const rootCell = rng.pick(rootCells(tuning, root, frets));
  const cells = scaleShape(tuning, s, rootCell);
  const midis = cells.map((c) => cellMidi(tuning, c));
  const spelled = spellScale(s, root);
  const names = [...spelled, spelled[0]];
  const n = s.steps.length;
  const placements: Placement[] = [];
  for (let i = 1; i <= n; i++) placements.push({ from: i - 1, to: i, direction: 'up', semis: midis[i] - midis[i - 1], travel: travelAt(cells[i - 1]) });
  for (let i = n - 1; i >= 0; i--) placements.push({ from: i + 1, to: i, direction: 'down', semis: midis[i + 1] - midis[i], travel: travelAt(cells[i + 1]) });
  return { scale: scaleId, root, names, cells, midis, placements };
}

