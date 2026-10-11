// Bending: the prompts, how far a drag bends a string, and the scoring.
//
// Two games share this file. In the first a single bend is pushed to a target
// pitch and judged when the finger lifts. In the second ("trace") a bend that
// changes over time is heard and then played back, and judged over its length.

import { cellMidi, type Cell, type Tuning } from './music';
import type { Rng } from './rng';
import { cleanMultipliers, stepStreak, type Step, type Streak } from './streak';

export type BendTier = 'standard' | 'advanced' | 'virtuoso';
export const BEND_TIERS: readonly BendTier[] = ['standard', 'advanced', 'virtuoso'];

/** How many bends make a run, in both games. */
export const BEND_PROMPTS = 10;

/** Semitones a bend can be asked for, and how often, by tier (design document 2.3). */
const SEMIS: Record<BendTier, readonly (readonly [number, number])[]> = {
  standard: [[1, 2], [2, 3]],
  advanced: [[1, 2], [2, 3], [3, 2]],
  virtuoso: [[1, 1], [2, 2], [3, 2], [4, 2]],
};

/** "½", "1", "1½", "2": how guitarists write a bend, in whole steps. */
export function bendLabel(semis: number): string {
  const whole = Math.floor(semis / 2);
  const half = semis % 2 === 1;
  return `${whole || !half ? whole : ''}${half ? '½' : ''}`;
}

// --- the drag ----------------------------------------------------------------

// How far a string has to be pushed for a semitone is not one number. It
// changes from string to string and along the neck, as it does on a guitar,
// and each prompt moves it a little at random on top of that. The point is the
// ear: a bend cannot be learned as a distance on the screen.

/** The most a string can be bent, in cents. */
export const MAX_BEND_CENTS = 460;
/** A semitone of bend, in gaps between strings, before the string and the place on the neck are counted. */
const BASE_TRAVEL = 0.85;
/**
 * How each string compares, lowest first. Roughly a real set: the plain G
 * gives the most pitch for the least push, the high E and the wound D the least.
 */
const STRING_TRAVEL = [0.95, 1.0, 1.1, 0.9, 1.0, 1.1];
/** Each prompt is this much either side of its string's usual travel. */
const TRAVEL_JITTER = 0.1;

/**
 * How the place on the neck changes the travel, from the geometry of a string
 * pulled sideways: the nearer the fretted point is to the middle of the string
 * (fret 12), the further it must be pushed for the same stretch. 1 at fret 12,
 * about 0.87 at fret 5, 0.73 at fret 3.
 */
export function positionTravel(fret: number): number {
  const r = Math.pow(2, -fret / 12);
  return Math.sqrt(4 * r * (1 - r));
}

/** A semitone's travel at a cell, in gaps between strings, with the prompt's random part drawn from `rng`. */
export function semitoneTravel(rng: Rng, tuning: Tuning, cell: Cell): number {
  const string = tuning.open.length === STRING_TRAVEL.length ? STRING_TRAVEL[cell.string] : 1;
  const jitter = 1 + TRAVEL_JITTER * (rng.next() * 2 - 1);
  return BASE_TRAVEL * string * positionTravel(cell.fret) * jitter;
}

/** Cents of bend for a finger moved `px` across the neck, either way, where a semitone takes `semitonePx`. */
export function centsFromDrag(px: number, semitonePx: number): number {
  return Math.min(MAX_BEND_CENTS, (Math.abs(px) / semitonePx) * 100);
}

export function dragForCents(cents: number, semitonePx: number): number {
  return (cents / 100) * semitonePx;
}

// --- a single bend -----------------------------------------------------------

export interface BendPrompt {
  cell: Cell;
  /** A semitone of this bend, in gaps between strings. */
  travel: number;
  semis: number;
  /** MIDI number of the fretted note and of the note the bend should reach. */
  from: number;
  to: number;
}

/** Bends are asked for from this fret up to the 17th, or the end of the neck if that is nearer. */
const FIRST_BEND_FRET = 5;
const LAST_BEND_FRET = 17;

/**
 * Where a bend is asked for: the upper frets, mostly on the three high strings,
 * where bends are actually played. Wide bends keep to the high strings.
 */
function bendCell(rng: Rng, tuning: Tuning, semis: number, frets: number): Cell {
  const top = tuning.open.length - 1;
  const weights = tuning.open.map((_, s) => {
    const fromTop = top - s;
    if (semis >= 3) return fromTop <= 2 ? 3 : 0;
    return fromTop <= 2 ? 4 : fromTop === 3 ? 2 : 1;
  });
  const last = Math.max(FIRST_BEND_FRET, Math.min(LAST_BEND_FRET, frets));
  return { string: rng.weighted(weights), fret: FIRST_BEND_FRET + rng.int(last - FIRST_BEND_FRET + 1) };
}

export function makeBendPrompt(rng: Rng, tuning: Tuning, tier: BendTier, frets: number): BendPrompt {
  const table = SEMIS[tier];
  const semis = table[rng.weighted(table.map(([, w]) => w))][0];
  const cell = bendCell(rng, tuning, semis, frets);
  const from = cellMidi(tuning, cell);
  return { cell, travel: semitoneTravel(rng, tuning, cell), semis, from, to: from + semis };
}

export type Grade = 'bullseye' | 'intune' | 'acceptable' | 'off';

export const GRADE_WORDS: Record<Grade, string> = {
  bullseye: 'Bullseye',
  intune: 'In tune',
  acceptable: 'Acceptable',
  off: 'Off pitch',
};

/** The design document's 2.4: how close, in cents, earns what. */
export function gradeBend(errorCents: number): Grade {
  const off = Math.abs(errorCents);
  return off <= 5 ? 'bullseye' : off <= 15 ? 'intune' : off <= 30 ? 'acceptable' : 'off';
}

/**
 * What each grade is worth at ×1. With the streak (core/streak.ts) a run of
 * ten bullseyes comes to about 100,000.
 */
export const GRADE_BASE: Record<Grade, number> = { bullseye: 4700, intune: 3500, acceptable: 1600, off: 0 };

/** Green bends (bullseye, in tune) step the streak up a quarter, tan ones (acceptable) a tenth; an off bend breaks it. */
export function gradeStep(grade: Grade): Step {
  return grade === 'bullseye' || grade === 'intune' ? 'green' : grade === 'acceptable' ? 'ok' : 'miss';
}

export interface Scored {
  points: number;
  /** The streak to carry into the next prompt. */
  streak: Streak;
}

/**
 * A bend scores at the multiplier it found, and then moves it. A run of other
 * than BEND_PROMPTS bends (a song's phrases) is weighted so that a perfect one
 * still comes to the same.
 */
export function scoreGrade(grade: Grade, streak: Streak, prompts = BEND_PROMPTS): Scored {
  const weight = cleanMultipliers(BEND_PROMPTS) / cleanMultipliers(Math.max(1, prompts));
  return { points: Math.round(GRADE_BASE[grade] * weight * streak.mult), streak: stepStreak(streak, gradeStep(grade)) };
}

// --- a bend over time --------------------------------------------------------

/** A bend drawn as straight lines between points: seconds from the start, and cents. */
export interface Contour {
  points: readonly { t: number; cents: number }[];
  /** Where it settles, in order, in semitones: what the prompt names. */
  stops: readonly number[];
  /** Whether the first stop is bent before the note is picked. */
  pre?: boolean;
  /** Seconds in a beat, where the bend is played to one. */
  beat?: number;
}

export function contourDuration(contour: Contour): number {
  return contour.points[contour.points.length - 1].t;
}

export function contourAt(contour: Contour, t: number): number {
  const p = contour.points;
  if (t <= p[0].t) return p[0].cents;
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i].t) {
      const span = p[i].t - p[i - 1].t;
      const k = span > 0 ? (t - p[i - 1].t) / span : 1;
      return p[i - 1].cents + (p[i].cents - p[i - 1].cents) * k;
    }
  }
  return p[p.length - 1].cents;
}

export function contourPeak(contour: Contour): number {
  return Math.max(...contour.points.map((p) => p.cents));
}

/** "1 → 2", "pre-bend 2 → release": the prompt's name. */
export function contourWords(contour: Contour): string {
  return contour.stops.map((s, i) => (i === 0 && contour.pre ? `pre-bend ${bendLabel(s)}` : s === 0 ? 'release' : bendLabel(s))).join(' → ');
}

// A bend over time is written as a phrase: moves in beats, each to a pitch,
// each with its own way of getting there. It is played to a beat, so a move
// always starts on a beat or half a beat, and lasts 1 to 4 beats.

/**
 * How a move gets to its pitch. A finger does not push at an even speed:
 * `snap` gets most of the way at once and then settles in, `swell` leans in
 * slowly and then rushes, `push` is slow at both ends.
 */
export type Curve = 'even' | 'snap' | 'swell' | 'push';

export interface Move {
  /** The pitch to go to, in semitones of bend. 0 is a release. */
  to: number;
  /** Beats from the start of this move to the start of the next. */
  beats: number;
  /** Beats the move takes to arrive. 0 is at once. */
  rise: number;
  curve?: Curve;
  /** Cents of vibrato on the held pitch, below it, once it has landed. */
  vibrato?: number;
}

export interface Phrase {
  /** Beats of the unbent note, from the pick to the first move. */
  lead: number;
  /** A pre-bend: the first move is pushed up before the pick, and heard bent from the start. */
  pre?: boolean;
  moves: readonly Move[];
}

/** An "instant" move still takes this long: a flick of the finger. */
export const INSTANT = 0.05;
/** Vibrato's speed, in swings a second, and how long a held note waits before it starts. */
const VIBRATO_HZ = 4.5;
const VIBRATO_DELAY = 0.25;

function eased(curve: Curve, k: number): number {
  switch (curve) {
    case 'snap':
      return 1 - (1 - k) * (1 - k);
    case 'swell':
      return k * k;
    case 'push':
      return k * k * (3 - 2 * k);
    default:
      return k;
  }
}

/** A phrase's length in beats. */
export function phraseBeats(phrase: Phrase): number {
  return phrase.lead + phrase.moves.reduce((sum, m) => sum + m.beats, 0);
}

/** A phrase as a contour, at `bpm`. */
export function buildContour(phrase: Phrase, bpm: number): Contour {
  const beat = 60 / bpm;
  const points: { t: number; cents: number }[] = [];
  const add = (t: number, cents: number) => {
    const last = points[points.length - 1];
    const at = Math.round(t * 1000) / 1000;
    if (last && at <= last.t) return;
    points.push({ t: at, cents: Math.round(cents * 10) / 10 });
  };
  let at = 0;
  let t = 0;
  const moves = phrase.moves;
  if (phrase.pre && moves.length) {
    at = moves[0].to * 100;
    add(0, at);
  } else {
    add(0, 0);
    t = phrase.lead * beat;
    add(t, 0);
  }
  moves.forEach((move, i) => {
    const start = t;
    const end = start + move.beats * beat;
    const to = move.to * 100;
    if (!(i === 0 && phrase.pre)) {
      const rise = Math.max(INSTANT, move.rise * beat);
      const curve = move.curve ?? 'even';
      if (curve !== 'even' && rise > INSTANT) {
        for (const k of [0.25, 0.5, 0.75]) add(start + rise * k, at + (to - at) * eased(curve, k));
      }
      add(start + rise, to);
    }
    if (move.vibrato && to > 0) {
      const half = 1 / VIBRATO_HZ / 2;
      let v = Math.max(t, points[points.length - 1].t) + VIBRATO_DELAY;
      let down = true;
      add(v, to);
      while (v + half < end - half) {
        v += half;
        add(v, down ? to - move.vibrato : to);
        down = !down;
      }
    }
    add(end, to);
    at = to;
    t = end;
  });
  return { points, stops: moves.map((m) => m.to), pre: phrase.pre, beat };
}

/** Beats a minute for each tier's traces. */
export const TRACE_BPM: Record<BendTier, number> = { standard: 76, advanced: 88, virtuoso: 100 };
/** The most beats a trace runs to, lead included. */
export const MAX_TRACE_BEATS = 8;
/** The lengths a move can have, in beats. */
export const MOVE_BEATS = [1, 1.5, 2, 2.5, 3, 4] as const;

/**
 * The sequences of stops a tier can ask for, in semitones. 0 is a release;
 * a leading "p" is a pre-bend, heard bent from the pick.
 */
const SHAPES: Record<BendTier, readonly string[]> = {
  standard: ['1 2', '2 1', '2 0', '1 0', '2 0 2', '1 0 1', 'p2 0', 'p1 0', '2 0 1'],
  advanced: ['1 2 3', '2 0 2', '3 2', '2 3 0', '1 2 0', '2 1 2', 'p3 2 0', 'p2 0 2', '3 0', 'p3 0'],
  virtuoso: ['2 4', '1 2 3 4', '4 2 0', '3 1 3', '2 4 2', '4 0 2', 'p4 2 0', 'p3 0 3', '3 4 3 0'],
};

/** How long each move is, by tier, as [beats, weight]. The last move may ring on longer. */
const LENGTHS: Record<BendTier, readonly (readonly [number, number])[]> = {
  standard: [[1, 3], [1.5, 1], [2, 3]],
  advanced: [[1, 3], [1.5, 2], [2, 2], [2.5, 1], [3, 1]],
  virtuoso: [[1, 4], [1.5, 2], [2, 2], [2.5, 1], [3, 1]],
};
const LAST_LENGTHS: readonly (readonly [number, number])[] = [[1.5, 1], [2, 3], [3, 2], [4, 1]];

/** How fast a move arrives, in beats, as [rise, weight]. 0 is at once. */
const RISES: Record<BendTier, readonly (readonly [number, number])[]> = {
  standard: [[0, 1], [0.25, 3], [0.5, 3], [1, 1]],
  advanced: [[0, 2], [0.25, 3], [0.5, 2], [1, 1]],
  virtuoso: [[0, 3], [0.25, 3], [0.5, 2], [1, 1]],
};
const CURVES: readonly (readonly [Curve, number])[] = [['snap', 3], ['even', 2], ['push', 2], ['swell', 1]];

/** How often a tier's last held bend gets vibrato, and how wide. */
const VIBRATO: Record<BendTier, readonly [number, number]> = { standard: [0, 0], advanced: [0.3, 20], virtuoso: [0.5, 28] };

function weightedOf<T>(rng: Rng, table: readonly (readonly [T, number])[]): T {
  return table[rng.weighted(table.map(([, w]) => w))][0];
}

export function makePhrase(rng: Rng, tier: BendTier): Phrase {
  const shape = rng.pick(SHAPES[tier]);
  const pre = shape.startsWith('p');
  const stops = shape.replace('p', '').split(' ').map(Number);
  const lengths = stops.map((_, i) => (i === stops.length - 1 ? weightedOf(rng, LAST_LENGTHS) : weightedOf(rng, LENGTHS[tier])));
  // Pick to first move: straight off the pick, half a beat, or a beat.
  let lead = pre ? 0 : rng.pick([0, 0.5, 1, 1]);
  // Too long: shorten the longest move a step at a time, then the lead.
  while (lead + lengths.reduce((a, b) => a + b, 0) > MAX_TRACE_BEATS) {
    const longest = lengths.indexOf(Math.max(...lengths));
    if (lengths[longest] > 1) lengths[longest] = MOVE_BEATS[MOVE_BEATS.indexOf(lengths[longest] as (typeof MOVE_BEATS)[number]) - 1];
    else lead = Math.max(0, lead - 0.5);
  }
  const [chance, depth] = VIBRATO[tier];
  const moves = stops.map((to, i): Move => {
    const beats = lengths[i];
    // Leave at least half a beat held at the pitch.
    let rise = weightedOf(rng, RISES[tier]);
    while (rise > 0 && beats - rise < 0.5) rise /= 2;
    const last = i === stops.length - 1;
    const vibrato = last && to > 0 && beats >= 2 && rng.next() < chance ? depth : undefined;
    return { to, beats, rise, curve: weightedOf(rng, CURVES), vibrato };
  });
  return { lead, pre, moves };
}

export interface TracePrompt {
  cell: Cell;
  /** A semitone of this bend, in gaps between strings. */
  travel: number;
  from: number;
  contour: Contour;
}

export function makeContour(rng: Rng, tier: BendTier): Contour {
  return buildContour(makePhrase(rng, tier), TRACE_BPM[tier]);
}

export function makeTracePrompt(rng: Rng, tuning: Tuning, tier: BendTier, frets: number): TracePrompt {
  const contour = makeContour(rng, tier);
  const cell = bendCell(rng, tuning, Math.round(contourPeak(contour) / 100), frets);
  return { cell, travel: semitoneTravel(rng, tuning, cell), from: cellMidi(tuning, cell), contour };
}

export interface TraceSample {
  t: number;
  cents: number;
}

/** A bend may run this far ahead of or behind the prompt without it counting. */
export const TRACE_SLACK = 0.12;

/**
 * The mean distance, in cents, between what was played and the prompt, over the
 * prompt's whole length. At each moment the played pitch is compared with the
 * nearest value the prompt takes within TRACE_SLACK seconds either side, so
 * being a tenth of a second early into a move costs nothing but being on the
 * wrong pitch does. Time after the finger lifts counts as an unbent string.
 */
export function traceError(contour: Contour, samples: readonly TraceSample[], slack = TRACE_SLACK): number {
  const duration = contourDuration(contour);
  const STEP = 0.02;
  let total = 0;
  let count = 0;
  let i = 0;
  for (let t = 0; t <= duration + 1e-9; t += STEP) {
    while (i + 1 < samples.length && samples[i + 1].t <= t) i++;
    const played = samples.length > 0 && samples[i].t <= t ? samples[i].cents : 0;
    let best = Infinity;
    for (let shift = -slack; shift <= slack + 1e-9; shift += STEP) {
      const wanted = contourAt(contour, Math.min(duration, Math.max(0, t + shift)));
      best = Math.min(best, Math.abs(played - wanted));
    }
    total += best;
    count++;
  }
  return count ? total / count : 0;
}

/** Tracing is harder than landing one pitch, so the bands are wider. */
export function gradeTrace(meanCents: number): Grade {
  return meanCents <= 10 ? 'bullseye' : meanCents <= 22 ? 'intune' : meanCents <= 40 ? 'acceptable' : 'off';
}
