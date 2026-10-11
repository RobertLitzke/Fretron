// Songs: games built around one song. Each song can carry its own version of
// any game (so far Bend Trace, as phrases of its bends); a song's card on the
// menu offers the games it has. Each song's data is its own file in songs/.

import { buildContour, semitoneTravel, type Phrase, type TracePrompt } from './bend';
import { cellMidi, type Cell, type Tuning } from './music';
import type { Rng } from './rng';
import { NUMB } from './songs/numb';

export interface SongPhrase {
  /** What the prompt is called. */
  name: string;
  /** Where it is played on a full-length neck. */
  cell: Cell;
  phrase: Phrase;
}

/** A song's Bend Trace: its bends, a phrase at a time, at its tempo. */
export interface SongTrace {
  bpm: number;
  phrases: readonly SongPhrase[];
}

export interface Song {
  id: string;
  title: string;
  /** The key and feel, for the ready panel. */
  about: string;
  trace?: SongTrace;
}

export const SONGS: readonly Song[] = [NUMB];

/** The games a song can have, as the menu names them and the route ends. */
export type SongGameKind = 'trace';

export const SONG_GAMES: readonly { kind: SongGameKind; name: string; has: (song: Song) => boolean }[] = [
  { kind: 'trace', name: 'Bend Trace', has: (song) => song.trace !== undefined },
];

export function songById(id: string): Song {
  return SONGS.find((s) => s.id === id) ?? SONGS[0];
}

/** Bends are kept from this fret up, as in the other bend games. */
const LOWEST_FRET = 5;

/**
 * Where a phrase is played on a neck of `frets` frets: where it is written if
 * that fits, or else the same pitch on another string, nearest first and
 * higher strings before lower ones; failing that, an octave down.
 */
export function placePhrase(tuning: Tuning, cell: Cell, frets: number): Cell {
  if (cell.fret <= frets) return cell;
  const midi = cellMidi(tuning, cell);
  const strings = tuning.open.map((_, s) => s).sort((a, b) => {
    const da = a - cell.string;
    const db = b - cell.string;
    return Math.abs(da) - Math.abs(db) || db - da;
  });
  for (const octave of [0, -12]) {
    for (const string of strings) {
      const fret = midi + octave - tuning.open[string];
      if (fret >= LOWEST_FRET && fret <= frets) return { string, fret };
    }
  }
  return { string: cell.string, fret: Math.min(frets, Math.max(LOWEST_FRET, cell.fret - 12)) };
}

export function makeSongPrompt(rng: Rng, tuning: Tuning, trace: SongTrace, index: number, frets: number): TracePrompt {
  const { cell: written, phrase } = trace.phrases[index];
  const cell = placePhrase(tuning, written, frets);
  return { cell, travel: semitoneTravel(rng, tuning, cell), from: cellMidi(tuning, cell), contour: buildContour(phrase, trace.bpm) };
}
