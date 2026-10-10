// Where the neck sits on the screen, and back again.
//
// Everything that draws the board and everything that reads a touch on it goes
// through this one mapping, so a left-handed board cannot disagree with its own
// touch targets.
//
// The conventions are FretFalcon's horizontal board (ts/fretboard/renderer.ts,
// `_toCanvas`): the lowest string is at the bottom for both hands, and the nut
// is on the left for a right-handed player and on the right for a left-handed
// one.
//
// Positions along the neck are in fret units: the nut is 0, fret wire n is n,
// and the middle of fret n (where a finger goes) is n - 0.5. The camera's
// `start` is the position at the nut-side edge of the window.
//
// An open string is fret 0. It has no fret to sit in, so it is tapped and drawn
// in the room beside the nut (PAD_NUT), which is why that room is a finger wide.

import type { Cell } from './music';

export type Hand = 'right' | 'left';

export interface LayoutInput {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  strings: number;
  /** How many frets the window shows. */
  visible: number;
  hand: Hand;
  lastFret: number;
}

/** Room kept for the fret numbers under the lowest string. */
const NUMBER_BAND = 18;
/** The widest the strings are ever set apart. */
const MAX_SPACING = 66;
/** Space on the nut side of the window, where the open strings are named and tapped, and on the body side. */
export const PAD_NUT = 44;
const PAD_BODY = 6;
/** The narrowest a fret is drawn when a long neck has to choose between shrinking and scrolling. */
const MIN_FRET_PX = 56;

export class BoardLayout {
  readonly width: number;
  readonly height: number;
  readonly strings: number;
  readonly visible: number;
  readonly hand: Hand;
  readonly lastFret: number;
  /** Pixels per fret. */
  readonly fretLen: number;
  /** Pixels between neighbouring strings. */
  readonly spacing: number;
  /** y of the highest-pitched string (the top one). */
  readonly topY: number;
  /** y of the lowest-pitched string (the bottom one). */
  readonly bottomY: number;
  /** y of the middle of the fret-number band. */
  readonly numberY: number;

  constructor(input: LayoutInput) {
    this.width = input.width;
    this.height = input.height;
    this.strings = input.strings;
    this.visible = input.visible;
    this.hand = input.hand;
    this.lastFret = input.lastFret;
    this.fretLen = (input.width - PAD_NUT - PAD_BODY) / input.visible;
    // Half a string's gap above the top string and below the bottom one, so a
    // touch on an outer string has as much room as one on an inner string.
    this.spacing = Math.min(MAX_SPACING, (input.height - NUMBER_BAND) / input.strings);
    const span = (input.strings - 1) * this.spacing;
    const free = input.height - NUMBER_BAND - span;
    this.topY = free / 2;
    this.bottomY = this.topY + span;
    this.numberY = this.bottomY + this.spacing / 2 + NUMBER_BAND / 2 - 1;
  }

  /** The furthest the camera can go toward the body. */
  get maxStart(): number {
    return Math.max(0, this.lastFret - this.visible);
  }

  clampStart(start: number): number {
    return Math.min(this.maxStart, Math.max(0, start));
  }

  /** x of a position along the neck. */
  x(pos: number, start: number): number {
    const along = PAD_NUT + (pos - start) * this.fretLen;
    return this.hand === 'left' ? this.width - along : along;
  }

  /** y of a string; fractional indices fall between strings. */
  y(string: number): number {
    return this.bottomY - string * this.spacing;
  }

  /** Where along the neck a fret is touched and drawn: its middle, or for an open string the middle of the room beside the nut. */
  pos(fret: number): number {
    return fret === 0 ? -PAD_NUT / 2 / this.fretLen : fret - 0.5;
  }

  /** The two ends of a fret along the neck, nut side first. */
  span(fret: number): [number, number] {
    return [fret === 0 ? -PAD_NUT / this.fretLen : fret - 1, fret];
  }

  center(cell: Cell, start: number): { x: number; y: number } {
    return { x: this.x(this.pos(cell.fret), start), y: this.y(cell.string) };
  }

  /** The inverse of x() and y(). */
  locate(x: number, y: number, start: number): { pos: number; string: number } {
    const along = this.hand === 'left' ? this.width - x : x;
    return {
      pos: start + (along - PAD_NUT) / this.fretLen,
      string: (this.bottomY - y) / this.spacing,
    };
  }

  /** The cell under a point, or null if it is off the playable neck. */
  cellAt(x: number, y: number, start: number): Cell | null {
    const { pos, string } = this.locate(x, y, start);
    const nearest = Math.round(string);
    // On the nut, or beside it as far as the edge of the board, is the open string.
    if (pos < this.span(0)[0] || pos > this.lastFret) return null;
    if (nearest < 0 || nearest >= this.strings) return null;
    return { string: nearest, fret: Math.max(0, Math.ceil(pos)) };
  }

  /** The camera position that puts `pos` in the middle of the window. */
  startCentredOn(pos: number): number {
    return this.clampStart(pos - this.visible / 2);
  }

  /** The nearest camera position to `start` that shows frets `low` to `high` whole. */
  startShowing(low: number, high: number, start: number): number {
    let next = start;
    if (low - 1 < next) next = low - 1;
    if (high > next + this.visible) next = high - this.visible;
    return this.clampStart(next);
  }
}

/**
 * How many frets to show at once. A neck of twelve frets or fewer is always
 * shown whole, so the default board never scrolls. A longer one is shown whole
 * if its frets stay wide enough to tap, and otherwise through a window of at
 * least twelve.
 */
export function visibleFrets(width: number, neck: number): number {
  if (neck <= 12) return neck;
  return Math.min(neck, Math.max(12, Math.floor((width - PAD_NUT - PAD_BODY) / MIN_FRET_PX)));
}
