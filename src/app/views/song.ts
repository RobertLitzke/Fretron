// The songs' games: each song's own version of a game, built from its data in
// core/songs/. So far Bend Trace, over the song's phrases in order at its tempo.

import { bendTargets, modeById } from '../../core/modes';
import { Rng } from '../../core/rng';
import { makeSongPrompt, songById } from '../../core/songs';
import type { View } from '../router';
import { freshSeed } from '../ui';
import { STREAK_LINE, traceGame } from './bend';

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
    targets: bendTargets(true),
    lines: [
      `${count} bends from ${song.title}, ${song.about}, at ${trace.bpm} bpm.`,
      'Hear each one, then play it back from memory on the lit note, on the beat.',
      STREAK_LINE,
    ],
  });
};
