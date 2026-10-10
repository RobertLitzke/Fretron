// Close-voiced triads on three neighbouring strings: naming them, checking a
// player's three notes against one, listing every place one can be played, and
// measuring how far the hand moved between two.
//
// FretFalcon keeps a catalogue of shapes (ts/music/triads.ts). Here a voicing is
// judged from its pitches instead, which gives the same shapes in standard
// tuning and needs no table.

import { cellMidi, LAST_FRET, pc, pcName, type Cell, type Spelling, type Tuning } from './music';
import type { Rng } from './rng';

export type Quality = 'maj' | 'min' | 'dim';

export interface Chord {
  /** Pitch class of the root. */
  root: number;
  quality: Quality;
}

const INTERVALS: Record<Quality, readonly [number, number, number]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: '°' };

/** The label of each chord tone, as FretFalcon's getIntervalLabel spells them. */
const TONE_LABELS: Record<Quality, readonly [string, string, string]> = {
  maj: ['R', '3', '5'],
  min: ['R', 'b3', '5'],
  dim: ['R', 'b3', 'd5'],
};

export type Inversion = 'Root' | '1st' | '2nd';
const INVERSIONS: readonly Inversion[] = ['Root', '1st', '2nd'];

/** The widest stretch, in frets, a close voicing on neighbouring strings needs. */
const MAX_REACH = 4;

export function chordName(chord: Chord, spelling: Spelling): string {
  return pcName(chord.root, spelling) + SUFFIX[chord.quality];
}

export function chordTones(chord: Chord): number[] {
  return INTERVALS[chord.quality].map((i) => pc(chord.root + i));
}

/** Three cells on three neighbouring strings, lowest string first. */
export type Voicing = readonly [Cell, Cell, Cell];

export interface VoicingCheck {
  ok: boolean;
  /** Why not, in words for the player. */
  reason?: string;
  inversion?: Inversion;
  /** 'R', '3', '5' and so on, in the same order as the sorted cells. */
  labels?: string[];
  voicing?: Voicing;
}

export function sortByString(cells: readonly Cell[]): Cell[] {
  return cells.slice().sort((a, b) => a.string - b.string);
}

/** Is this set of cells the chord, as a close voicing on three neighbouring strings? */
export function checkVoicing(tuning: Tuning, cells: readonly Cell[], chord: Chord): VoicingCheck {
  if (cells.length !== 3) return { ok: false, reason: 'Pick three notes' };
  const sorted = sortByString(cells);
  if (sorted[1].string !== sorted[0].string + 1 || sorted[2].string !== sorted[1].string + 1) {
    return { ok: false, reason: 'Use three neighbouring strings' };
  }
  const midis = sorted.map((c) => cellMidi(tuning, c));
  const tones = chordTones(chord);
  const which = midis.map((m) => tones.indexOf(pc(m)));
  if (which.includes(-1) || new Set(which).size !== 3) return { ok: false, reason: 'Not the chord' };
  if (midis[2] - midis[0] >= 12 || midis[1] <= midis[0] || midis[2] <= midis[1]) {
    return { ok: false, reason: 'Not a close voicing' };
  }
  return {
    ok: true,
    inversion: INVERSIONS[which[0]],
    labels: which.map((w) => TONE_LABELS[chord.quality][w]),
    voicing: sorted as unknown as Voicing,
  };
}

/** The stretch a shape asks of the hand, in frets. An open string takes no finger, so it does not count. */
function reach(frets: readonly number[]): number {
  const held = frets.filter((f) => f > 0);
  return held.length ? Math.max(...held) - Math.min(...held) : 0;
}

/**
 * Every close voicing of a chord on every set of three neighbouring strings.
 * With `first` at 0 the open strings are in play.
 */
export function enumerateVoicings(tuning: Tuning, chord: Chord, first = 1, last = LAST_FRET): Voicing[] {
  const out: Voicing[] = [];
  for (let low = 0; low + 2 < tuning.open.length; low++) {
    for (let a = first; a <= last; a++) {
      for (let b = first; b <= last; b++) {
        for (let c = first; c <= last; c++) {
          if (reach([a, b, c]) > MAX_REACH) continue;
          const cells: Voicing = [
            { string: low, fret: a },
            { string: low + 1, fret: b },
            { string: low + 2, fret: c },
          ];
          if (checkVoicing(tuning, cells, chord).ok) out.push(cells);
        }
      }
    }
  }
  return out;
}

export function voicingKey(voicing: readonly Cell[]): string {
  return sortByString(voicing)
    .map((c) => `${c.string}:${c.fret}`)
    .join('|');
}

/** What a pitch class is to a chord: 'R', 'b3', '5' and so on, or null if it is not in it. */
export function toneLabel(chord: Chord, pitchClass: number): string | null {
  const which = chordTones(chord).indexOf(pc(pitchClass));
  return which < 0 ? null : TONE_LABELS[chord.quality][which];
}

/** The voicing that moves the hand least from `from`: the first of `voicings` if there is nowhere to move from. */
export function nearestVoicing(voicings: readonly Voicing[], from: readonly Cell[] | null): Voicing | null {
  let best: Voicing | null = null;
  let least = Infinity;
  for (const v of voicings) {
    const moved = from && from.length === 3 ? displacement(from, v) : 0;
    if (moved < least) {
      least = moved;
      best = v;
    }
  }
  return best;
}

/** The cells of a voicing that a guess also has. */
function shared(guess: readonly Cell[], voicing: Voicing): Cell[] {
  return voicing.filter((c) => guess.some((g) => g.string === c.string && g.fret === c.fret));
}

/**
 * The real voicing a wrong guess was nearest to being: the one that shares
 * most cells with it, and among those the one that moves the hand least from
 * `near`.
 */
export function likeliest(guess: readonly Cell[], voicings: readonly Voicing[], near: readonly Cell[] | null = null): Voicing | null {
  const most = Math.max(0, ...voicings.map((v) => shared(guess, v).length));
  return nearestVoicing(voicings.filter((v) => shared(guess, v).length === most), near);
}

/**
 * What is worth keeping of a wrong guess: the cells it shares with the voicing
 * it was nearest to being. Not simply the cells that are chord tones: two
 * roots, or the right notes too far apart, cannot all be part of one answer.
 */
export function keepers(guess: readonly Cell[], voicings: readonly Voicing[], near: readonly Cell[] | null = null): Cell[] {
  const best = likeliest(guess, voicings, near);
  return best ? shared(guess, best) : [];
}

/**
 * The design document's displacement: the mean distance, in frets, each of the
 * three voices moved. Voices are matched low to low, middle to middle, high to
 * high, whichever strings they are on.
 */
export function displacement(previous: readonly Cell[], current: readonly Cell[]): number {
  const a = sortByString(previous);
  const b = sortByString(current);
  return (Math.abs(b[0].fret - a[0].fret) + Math.abs(b[1].fret - a[1].fret) + Math.abs(b[2].fret - a[2].fret)) / 3;
}

// --- progressions ------------------------------------------------------------

interface Pattern {
  /** Roman numerals, for the prompt. */
  roman: readonly string[];
  /** Semitones above the key note, and the chord built there. */
  steps: readonly (readonly [number, Quality])[];
}

const PATTERNS: readonly Pattern[] = [
  { roman: ['ii', 'V', 'I'], steps: [[2, 'min'], [7, 'maj'], [0, 'maj']] },
  { roman: ['I', 'IV', 'V'], steps: [[0, 'maj'], [5, 'maj'], [7, 'maj']] },
  { roman: ['I', 'vi', 'IV', 'V'], steps: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']] },
  { roman: ['I', 'V', 'vi', 'IV'], steps: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
  { roman: ['vi', 'IV', 'I', 'V'], steps: [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']] },
  { roman: ['I', 'iii', 'IV', 'V'], steps: [[0, 'maj'], [4, 'min'], [5, 'maj'], [7, 'maj']] },
  { roman: ['IV', 'V', 'iii', 'vi'], steps: [[5, 'maj'], [7, 'maj'], [4, 'min'], [9, 'min']] },
  { roman: ['vii°', 'I'], steps: [[11, 'dim'], [0, 'maj']] },
  { roman: ['i', 'iv', 'V'], steps: [[0, 'min'], [5, 'min'], [7, 'maj']] },
  { roman: ['i', '♭VII', '♭VI', 'V'], steps: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']] },
  { roman: ['i', '♭VI', '♭III', '♭VII'], steps: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']] },
  { roman: ['ii°', 'V', 'i'], steps: [[2, 'dim'], [7, 'maj'], [0, 'min']] },
];

/** Keys whose signatures are written in flats, by pitch class of the key note. */
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]); // F B♭ E♭ A♭ D♭
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm B♭m E♭m

export interface Progression {
  /** "C major", "A minor". */
  keyName: string;
  spelling: Spelling;
  roman: readonly string[];
  chords: Chord[];
}

export function makeProgression(rng: Rng): Progression {
  const pattern = rng.pick(PATTERNS);
  const key = rng.int(12);
  const minor = pattern.roman[pattern.roman.length - 1] === 'i' || pattern.roman[0] === 'i';
  const spelling: Spelling = (minor ? FLAT_MINOR : FLAT_MAJOR).has(key) ? 'flat' : 'sharp';
  return {
    keyName: `${pcName(key, spelling)} ${minor ? 'minor' : 'major'}`,
    spelling,
    roman: pattern.roman,
    chords: pattern.steps.map(([step, quality]) => ({ root: pc(key + step), quality })),
  };
}

// --- scoring, after the design document's section 3.3 ---------------------------

export const TRIAD_BASE_POINTS = 1000;
/** Seconds at which half the time points are left. They thin out but never reach zero: there is no time limit. */
export const TRIAD_HALF_SECONDS = 4;
export const SMOOTH_FRETS = 2;
export const MODERATE_FRETS = 4;
export const SMOOTH_BONUS = 500;
export const MODERATE_BONUS = 200;

export function timePoints(seconds: number): number {
  return Math.round((TRIAD_BASE_POINTS * TRIAD_HALF_SECONDS) / (TRIAD_HALF_SECONDS + Math.max(0, seconds)));
}

export type Motion = 'smooth' | 'moderate' | 'leap';

export function motionOf(mean: number): Motion {
  return mean <= SMOOTH_FRETS ? 'smooth' : mean <= MODERATE_FRETS ? 'moderate' : 'leap';
}

export function motionBonus(motion: Motion): number {
  return motion === 'smooth' ? SMOOTH_BONUS : motion === 'moderate' ? MODERATE_BONUS : 0;
}
