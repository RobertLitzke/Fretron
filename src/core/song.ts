// Song Bends: the bends of a well-known solo, a phrase at a time, played back
// over its beat as in Bend Trace.
//
// The phrases are sketches, written for this game by ear and from what such
// solos are known for (long slow pushes, pre-bends let down, overbends with a
// wide vibrato): the shape and timing of each bend, not a transcription. They
// run from the gentlest to the hardest.

import { buildContour, semitoneTravel, type Phrase, type TracePrompt } from './bend';
import { cellMidi, type Cell, type Tuning } from './music';
import type { Rng } from './rng';

export interface SongPhrase {
  /** What the prompt is called. */
  name: string;
  /** Where it is played on a full-length neck. */
  cell: Cell;
  phrase: Phrase;
}

export interface Song {
  id: string;
  title: string;
  /** The key and feel, for the ready panel. */
  about: string;
  bpm: number;
  phrases: readonly SongPhrase[];
}

// Strings are counted from the low E: 3 is the G, 4 the B, 5 the high E.
const G = 3;
const B = 4;
const E = 5;

export const NUMB: Song = {
  id: 'numb',
  title: 'Comfortably Numb',
  about: 'B minor, slow and wide',
  bpm: 64,
  phrases: [
    {
      name: 'First solo, the opening cry',
      cell: { string: B, fret: 15 },
      phrase: { lead: 0.5, moves: [{ to: 2, beats: 4, rise: 1, curve: 'push', vibrato: 18 }] },
    },
    {
      name: 'First solo, up and let down',
      cell: { string: G, fret: 14 },
      phrase: {
        lead: 0.5,
        moves: [
          { to: 2, beats: 2, rise: 0.5, curve: 'snap' },
          { to: 0, beats: 2, rise: 1, curve: 'push' },
        ],
      },
    },
    {
      name: 'First solo, a half-step lean',
      cell: { string: E, fret: 14 },
      phrase: {
        lead: 1,
        moves: [
          { to: 1, beats: 2, rise: 0.5, curve: 'swell' },
          { to: 0, beats: 1.5, rise: 0.5 },
        ],
      },
    },
    {
      name: 'First solo, pre-bent and let down',
      cell: { string: B, fret: 15 },
      phrase: {
        lead: 0,
        pre: true,
        moves: [
          { to: 2, beats: 1, rise: 0 },
          { to: 0, beats: 3, rise: 1.5, curve: 'push' },
        ],
      },
    },
    {
      name: 'First solo, up, down, up again',
      cell: { string: B, fret: 17 },
      phrase: {
        lead: 0,
        moves: [
          { to: 2, beats: 1.5, rise: 0.25, curve: 'snap' },
          { to: 0, beats: 1, rise: 0.25 },
          { to: 2, beats: 2.5, rise: 0.5, curve: 'snap', vibrato: 22 },
        ],
      },
    },
    {
      name: 'Second solo, quick double bend',
      cell: { string: E, fret: 17 },
      phrase: {
        lead: 0,
        moves: [
          { to: 2, beats: 1, rise: 0, curve: 'snap' },
          { to: 0, beats: 1, rise: 0.25 },
          { to: 2, beats: 2, rise: 0.25, curve: 'snap', vibrato: 25 },
        ],
      },
    },
    {
      name: 'Second solo, the staged climb',
      cell: { string: G, fret: 14 },
      phrase: {
        lead: 0.5,
        moves: [
          { to: 2, beats: 1.5, rise: 0.5, curve: 'push' },
          { to: 4, beats: 2.5, rise: 0.5, curve: 'snap', vibrato: 20 },
        ],
      },
    },
    {
      name: 'Second solo, overbend and fall',
      cell: { string: B, fret: 15 },
      phrase: {
        lead: 0,
        moves: [
          { to: 4, beats: 1.5, rise: 0.25, curve: 'snap' },
          { to: 2, beats: 1, rise: 0.25 },
          { to: 0, beats: 1.5, rise: 0.5 },
        ],
      },
    },
    {
      name: 'Second solo, the screaming hold',
      cell: { string: E, fret: 19 },
      phrase: {
        lead: 0.5,
        moves: [
          { to: 2, beats: 3, rise: 1, curve: 'push', vibrato: 30 },
          { to: 0, beats: 1, rise: 0.5 },
        ],
      },
    },
    {
      name: 'Second solo, the last cry',
      cell: { string: E, fret: 22 },
      phrase: {
        lead: 0,
        moves: [
          { to: 2, beats: 1, rise: 0, curve: 'snap' },
          { to: 0, beats: 1, rise: 0.25 },
          { to: 2, beats: 1, rise: 0.25, curve: 'snap' },
          { to: 4, beats: 3, rise: 0.5, curve: 'push', vibrato: 28 },
        ],
      },
    },
  ],
};

export const SONGS: readonly Song[] = [NUMB];

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

export function makeSongPrompt(rng: Rng, tuning: Tuning, song: Song, index: number, frets: number): TracePrompt {
  const { cell: written, phrase } = song.phrases[index];
  const cell = placePhrase(tuning, written, frets);
  return { cell, travel: semitoneTravel(rng, tuning, cell), from: cellMidi(tuning, cell), contour: buildContour(phrase, song.bpm) };
}
