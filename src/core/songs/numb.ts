// Comfortably Numb: the bends of its two solos.
//
// The phrases are sketches, written for this game by ear and from what these
// solos are known for (long slow pushes, pre-bends let down, overbends with a
// wide vibrato): the shape and timing of each bend, not a transcription. They
// run from the gentlest to the hardest.

import type { Song } from '../songs';

// Strings are counted from the low E: 3 is the G, 4 the B, 5 the high E.
const G = 3;
const B = 4;
const E = 5;

export const NUMB: Song = {
  id: 'numb',
  title: 'Comfortably Numb',
  about: 'B minor, slow and wide',
  trace: {
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
  },
};
