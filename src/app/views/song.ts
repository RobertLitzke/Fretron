// Song Bends: Bend Trace over the phrases of a song (core/song.ts), in order,
// at the song's tempo.

import { modeById } from '../../core/modes';
import { Rng } from '../../core/rng';
import { makeSongPrompt, songById } from '../../core/song';
import type { View } from '../router';
import { freshSeed } from '../ui';
import { traceGame } from './bend';

export const songView: View = (root, ctx) => {
  const song = songById(ctx.params.song);
  const rng = new Rng(freshSeed());
  const count = song.phrases.length;
  return traceGame(root, ctx, {
    mode: modeById(`song-${song.id}`)!,
    subtitle: song.title,
    bpm: song.bpm,
    prompts: count,
    makePrompt: (index, tuning, frets) => makeSongPrompt(rng, tuning, song, index, frets),
    caption: (index) => song.phrases[index].name,
    lines: [
      `${count} bends inspired by the solos of ${song.title}: ${song.about}, at ${song.bpm} beats a minute. Each is a sketch of a bend's shape and timing, from the gentlest to the hardest.`,
      'Hear each one with its beat and see its shape, then hold the lit note on a beat and play it back from memory. Tap with another finger to call it off and hear it again.',
      'Scored as Bend Trace is, on how far your pitch was from the bend along the way. Tap the note afterwards to hear yours.',
    ],
  });
};
