// The songs' games: each song's own version of a game, built from its data in
// core/songs/. So far Bend Trace, over the song's phrases in order at its tempo.

import { modeById } from '../../core/modes';
import { Rng } from '../../core/rng';
import { makeSongPrompt, songById } from '../../core/songs';
import type { View } from '../router';
import { freshSeed } from '../ui';
import { traceGame } from './bend';

export const songTraceView: View = (root, ctx) => {
  const song = songById(ctx.params.song);
  const trace = song.trace;
  if (!trace) return void ctx.replace('/home');
  const rng = new Rng(freshSeed());
  const count = trace.phrases.length;
  return traceGame(root, ctx, {
    mode: modeById(`song-${song.id}-trace`)!,
    subtitle: 'Bend Trace',
    bpm: trace.bpm,
    prompts: count,
    makePrompt: (index, tuning, frets) => makeSongPrompt(rng, tuning, trace, index, frets),
    caption: (index) => trace.phrases[index].name,
    lines: [
      `${count} bends inspired by the solos of ${song.title}: ${song.about}, at ${trace.bpm} beats a minute. Each is a sketch of a bend's shape and timing, from the gentlest to the hardest.`,
      'Hear each one with its beat and see its shape, then hold the lit note on a beat and play it back from memory. Tap with another finger to call it off and hear it again.',
      'Scored as Bend Trace is, on how far your pitch was from the bend along the way. Tap the note afterwards to hear yours.',
    ],
  });
};
