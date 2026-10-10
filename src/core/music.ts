// Pitches, names and the neck. Pitch classes count from C (0) to B (11);
// pitches are MIDI numbers.

/** A place on the neck. String 0 is the lowest-pitched; fret 1 is the first fret, and fret 0 the open string. */
export interface Cell {
  string: number;
  fret: number;
}

export interface Tuning {
  readonly name: string;
  /** Open-string MIDI numbers, lowest string first. */
  readonly open: readonly number[];
}

// The same numbers as FretFalcon's STANDARD_TUNING (ts/fretboard/instruments.ts).
export const STANDARD_TUNING: Tuning = { name: 'Standard', open: [40, 45, 50, 55, 59, 64] };

/** The longest neck on offer. */
export const LAST_FRET = 22;
/**
 * How many frets a game can be played over. Twelve is one of every note on
 * every string, and fits on a phone without scrolling; the longer necks are a
 * setting. The note and triad games also take the open strings, as fret 0; a
 * bend needs a fretted note.
 */
export const NECK_SIZES = [12, 15, 17, 22] as const;
export const DEFAULT_FRETS = 12;

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

/** How to spell the five notes that have two names. */
export type Spelling = 'sharp' | 'flat';

export function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function pcName(pitchClass: number, spelling: Spelling): string {
  return (spelling === 'flat' ? FLAT_NAMES : SHARP_NAMES)[pc(pitchClass)];
}

export function isNatural(pitchClass: number): boolean {
  return SHARP_NAMES[pc(pitchClass)].length === 1;
}

export function cellMidi(tuning: Tuning, cell: Cell): number {
  return tuning.open[cell.string] + cell.fret;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** How far `hz` is above `targetHz`, in cents; negative when below. */
export function centsOff(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export function cellKey(cell: Cell): string {
  return `${cell.string}:${cell.fret}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.string === b.string && a.fret === b.fret;
}

/** Every cell from fret `first` to fret `last`, lowest string first. */
export function allCells(tuning: Tuning, first = 1, last = LAST_FRET): Cell[] {
  const out: Cell[] = [];
  for (let string = 0; string < tuning.open.length; string++) {
    for (let fret = first; fret <= last; fret++) out.push({ string, fret });
  }
  return out;
}

/** The cells in a fret range that sound a given pitch class. */
export function cellsOfPc(tuning: Tuning, pitchClass: number, first = 1, last = LAST_FRET): Cell[] {
  return allCells(tuning, first, last).filter((c) => pc(cellMidi(tuning, c)) === pc(pitchClass));
}

/** "G string", "low E string", "high E string": how a player names a string. */
export function stringName(tuning: Tuning, string: number): string {
  const name = SHARP_NAMES[pc(tuning.open[string])];
  const twins = tuning.open.flatMap((m, i) => (pc(m) === pc(tuning.open[string]) ? [i] : []));
  if (twins.length < 2) return name;
  return `${string === twins[0] ? 'low' : 'high'} ${name}`;
}
