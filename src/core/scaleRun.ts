// Scale Run: a scale shape is drawn, and the player taps it up and down in
// time with the beat, one note a beat, a round at each of three tempos and in
// a new position each round. Scale Builder teaches what a scale sounds like;
// this one is what it feels like under the fingers at tempo, which is what a
// metronome is for.

import { type Grade, scoreGrade } from './bend';
import { type Cell, type Tuning } from './music';
import type { Rng } from './rng';
import { builderScale, rootCells, scaleShape, spellScale, type BuilderScaleId } from './scaleBuilder';
import type { Streak } from './streak';

/** The tempo of each round, in beats a minute: a note a beat. */
export const ROUND_BPM: readonly number[] = [72, 92, 112];
export const ROUNDS = ROUND_BPM.length;

/** How far from the beat, in milliseconds, earns what. */
export const TAP_BANDS: Readonly<Record<Exclude<Grade, 'off'>, number>> = { bullseye: 50, intune: 100, acceptable: 180 };
/** A note not played this long after its beat is missed. */
export const MISS_MS = 220;

export const TAP_WORDS: Readonly<Record<Grade, string>> = {
  bullseye: 'On the beat',
  intune: 'Close',
  acceptable: 'Loose',
  off: 'Off',
};

export function gradeTap(errorMs: number): Grade {
  const off = Math.abs(errorMs);
  return off <= TAP_BANDS.bullseye ? 'bullseye' : off <= TAP_BANDS.intune ? 'intune' : off <= TAP_BANDS.acceptable ? 'acceptable' : 'off';
}

export interface RunRound {
  bpm: number;
  /** Root to octave, on the neck, in one position. */
  cells: Cell[];
  /** Root to octave, spelled. */
  names: string[];
  /** The notes to play, as indexes into `cells`: up to the octave and back down, one a beat. */
  order: number[];
}

/** Up to the octave and back: a scale of n notes is 2n + 1 taps. */
export function runOrder(notes: number): number[] {
  const up = [...Array(notes + 1).keys()];
  return [...up, ...up.slice(0, -1).reverse()];
}

/**
 * A round of the scale on root pitch class `root`, from a root cell other than
 * `avoid` where there is one: the same shape in another position.
 */
export function makeRunRound(rng: Rng, tuning: Tuning, scaleId: BuilderScaleId, root: number, frets: number, bpm: number, avoid: Cell | null): RunRound {
  const s = builderScale(scaleId);
  const roots = rootCells(tuning, root, frets);
  const fresh = roots.filter((c) => !avoid || c.string !== avoid.string || c.fret !== avoid.fret);
  const rootCell = rng.pick(fresh.length ? fresh : roots);
  const cells = scaleShape(tuning, s, rootCell);
  const spelled = spellScale(s, root);
  return { bpm, cells, names: [...spelled, spelled[0]], order: runOrder(s.steps.length) };
}

/** The taps in a whole run of a scale of `notes` notes: for weighting each one's points. */
export function runTaps(notes: number): number {
  return ROUNDS * (2 * notes + 1);
}

/** A tap scores as a bend does, weighted so that a run on the beat throughout comes to the usual scale. */
export function scoreTap(grade: Grade, streak: Streak, taps: number): { points: number; streak: Streak } {
  return scoreGrade(grade, streak, taps);
}

/** The miss a note that was never played, or was the wrong note, counts for in the run's average. */
export const MISSED_TAP_MS = MISS_MS;
