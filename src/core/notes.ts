// Finding single notes: Speed Hunter's prompts and points, and Fret Sweeper's
// board-clearing state.

import { allCells, cellKey, cellMidi, isNatural, pc, pcName, type Cell, type Spelling, type Tuning } from './music';
import type { Rng } from './rng';

export type Accidentals = 'mixed' | 'sharp' | 'flat';

/** The name a prompt shows for a pitch class, under the player's spelling setting. */
export function promptName(rng: Rng, pitchClass: number, accidentals: Accidentals): string {
  const spelling: Spelling = accidentals === 'mixed' ? (rng.next() < 0.5 ? 'sharp' : 'flat') : accidentals;
  return pcName(pitchClass, isNatural(pitchClass) ? 'sharp' : spelling);
}

// --- Speed Hunter (design document 4.2) ---------------------------------------

/**
 * By name: any fret that plays the called note.
 * Advanced: a name and either a string or a fret, so that only that one place
 * (or its octave on the same string, or its twin on the other E string) will do.
 */
export type HuntVariant = 'name' | 'advanced';

export const HUNT_PROMPTS = 20;
/**
 * Seconds added for a wrong fret. There is no time limit: the clock counts up
 * while a note is being looked for, and a run is its total time.
 */
export const HUNT_PENALTY = 3;
/** On a neck too long to show whole, the window moves after this many prompts. */
export const HUNT_PROMPTS_PER_WINDOW = 5;

export interface HuntPrompt {
  pitchClass: number;
  /** What to show: a note name. */
  name: string;
  /** The pitch to sound. */
  midi: number;
  /** The string the note is to be found on, where the advanced game names one. */
  string: number | null;
  /** The fret it is to be found at, where the advanced game names that instead. */
  fret: number | null;
  /** Every cell that counts as right. */
  answers: Cell[];
}

/** A prompt whose answers all lie in frets `first` to `last`. */
export function makeHuntPrompt(
  rng: Rng,
  tuning: Tuning,
  variant: HuntVariant,
  first: number,
  last: number,
  accidentals: Accidentals,
  previous: HuntPrompt | null,
): HuntPrompt {
  const cells = allCells(tuning, first, last);
  for (;;) {
    const cell = rng.pick(cells);
    const pitchClass = pc(cellMidi(tuning, cell));
    if (previous && previous.pitchClass === pitchClass) continue;
    const name = promptName(rng, pitchClass, accidentals);
    const everywhere = cells.filter((c) => pc(cellMidi(tuning, c)) === pitchClass);
    // Sound the name in the middle of the guitar's range, not at one of the answers.
    const sounded = 52 + ((pitchClass - 4 + 12) % 12);
    if (variant === 'name') return { pitchClass, name, midi: sounded, string: null, fret: null, answers: everywhere };
    // An open string is not "at a fret": it is asked for by its string.
    if (cell.fret === 0 || rng.next() < 0.5) {
      return { pitchClass, name, midi: sounded, string: cell.string, fret: null, answers: everywhere.filter((c) => c.string === cell.string) };
    }
    return { pitchClass, name, midi: sounded, string: null, fret: cell.fret, answers: everywhere.filter((c) => c.fret === cell.fret) };
  }
}

// --- Fret Sweeper (design document 4.3) ---------------------------------------

/** Seconds added to the clock for tapping a fret that is not the called note. */
export const SWEEP_PENALTY = 3;

/**
 * By note: a note is called and stays called until every fret of it is gone.
 * Random: every call is answered by one fret, and the next call is another note.
 */
export type SweepKind = 'note' | 'random';

/** 'next-call' is a hit that also ends the call: the next note is due. */
export type SweepTap = 'hit' | 'miss' | 'dead' | 'next-call' | 'board-cleared';

/** The whole neck, cleared a called note at a time. */
export class Sweep {
  /**
   * The pitch classes in the order they will be called: each of the twelve
   * once by note, and one call for every fret at random.
   */
  readonly order: number[];
  private index = 0;
  private readonly live = new Map<string, Cell>();
  private readonly tuning: Tuning;
  mistakes = 0;
  readonly total: number;

  constructor(
    rng: Rng,
    tuning: Tuning,
    first: number,
    last: number,
    readonly kind: SweepKind = 'note',
  ) {
    this.tuning = tuning;
    for (const cell of allCells(tuning, first, last)) this.live.set(cellKey(cell), cell);
    this.total = this.live.size;
    this.order = kind === 'random' ? this.randomOrder(rng) : rng.shuffle([...Array(12).keys()]).filter((p) => this.count(p) > 0);
  }

  private count(pitchClass: number): number {
    let n = 0;
    for (const cell of this.live.values()) if (pc(cellMidi(this.tuning, cell)) === pitchClass) n++;
    return n;
  }

  /** A call for every fret on the board, with no note called twice running. */
  private randomOrder(rng: Rng): number[] {
    const counts = Array.from({ length: 12 }, (_, p) => this.count(p));
    const order: number[] = [];
    for (let left = this.total; left > 0; left--) {
      const last = order[order.length - 1];
      // A note that is more than half of what is left has to go now, or it
      // ends up beside itself later.
      const crowded = counts.findIndex((n) => n * 2 > left);
      const next = crowded >= 0 && crowded !== last ? crowded : rng.weighted(counts.map((n, p) => (p === last && n < left ? 0 : n)));
      counts[next]--;
      order.push(next);
    }
    return order;
  }

  get done(): boolean {
    return this.index >= this.order.length;
  }

  /** The pitch class being called. */
  get target(): number {
    return this.order[Math.min(this.index, this.order.length - 1)];
  }

  /** How many of the called note are still on the board. */
  get left(): number {
    return this.done ? 0 : this.count(this.target);
  }

  get cleared(): number {
    return this.total - this.live.size;
  }

  /** Calls still to come after this one. */
  get notesLeft(): number {
    return Math.max(0, this.order.length - this.index - 1);
  }

  isDead(cell: Cell): boolean {
    return !this.live.has(cellKey(cell));
  }

  tap(cell: Cell): SweepTap {
    if (this.done || this.isDead(cell)) return 'dead';
    if (pc(cellMidi(this.tuning, cell)) !== this.target) {
      this.mistakes++;
      return 'miss';
    }
    this.live.delete(cellKey(cell));
    if (this.kind === 'note' && this.count(this.target) > 0) return 'hit';
    this.index++;
    return this.done ? 'board-cleared' : 'next-call';
  }
}
