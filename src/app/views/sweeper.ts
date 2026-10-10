// Fret Sweeper: clear the whole neck against the clock. By note, a note is
// called and stays called until every fret of it is gone. At random, every tap
// is answered by a new call.

import { blip, pluck, thud } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import { formatSeconds, modeById, rankSweep, rankSweepRandom } from '../../core/modes';
import { cellKey, cellMidi, pc, pcName, type Cell } from '../../core/music';
import { promptName, Sweep, SWEEP_PENALTY, type SweepKind } from '../../core/notes';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { BEAT_MS, makeFrame, readyPanel } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { getSave } from '../store';
import { freshSeed } from '../ui';

/** The beat between calls at random. Shorter than the usual one: there is one after every tap. */
const RANDOM_BEAT_MS = 320;
/** How long the name of a wrongly tapped fret stays up. */
const MISS_SHOWN_MS = 1100;

export const sweeperView: View = (root, ctx) => {
  const kind: SweepKind = ctx.params.variant === 'random' ? 'random' : 'note';
  const mode = modeById(kind === 'random' ? 'sweeper-random' : 'sweeper')!;
  const rng = new Rng(freshSeed());
  const accidentals = getSave().accidentals;

  const frame = makeFrame(root, ctx, mode.title, { onDown });
  const { board, tuning } = frame;
  // From fret 0: the open strings are swept too.
  const sweep = new Sweep(rng, tuning, 0, frame.frets, kind);
  const dead = new Set<string>();

  /** Seconds spent on the calls already answered. The clock stands still between calls. */
  let ran = 0;
  /** performance.now() when the note was called, or 0 while none is. */
  let liveSince = 0;
  let penalty = 0;
  let name = '';
  /** Counts the wrong frets shown, so that a late timer clears only its own. */
  let missShown = 0;

  const progress = () => el('span.caps', {}, `${sweep.cleared} / ${sweep.total}`);

  function call(): void {
    name = promptName(rng, sweep.target, accidentals);
    // The called note, in the middle of the guitar's range.
    pluck(52 + ((sweep.target - 4 + 12) % 12), { level: 0.5 });
    paint(true);
    liveSince = performance.now();
  }

  function paint(fresh = false): void {
    frame.setPrompt(
      el(`b.call${fresh ? '.pop' : ''}`, {}, name),
      kind === 'note' ? el('span.call-sub', {}, `${sweep.left} left`) : null,
      progress(),
    );
  }

  function seconds(nowMs: number): number {
    return ran + penalty + (liveSince ? (nowMs - liveSince) / 1000 : 0);
  }

  /** The call is answered: stop the clock, and take a beat before the next so the two notes do not sound together. */
  function rest(nowMs: number): void {
    ran += (nowMs - liveSince) / 1000;
    liveSince = 0;
    frame.setClock(formatSeconds(seconds(0)));
    frame.setPrompt(el('b.call.wait', {}, '· · ·'), progress());
    frame.later(kind === 'random' ? RANDOM_BEAT_MS : BEAT_MS, call);
  }

  /** Name the fret that was tapped by mistake: what it is, as well as what it is not. */
  function showMiss(cell: Cell): void {
    const danger = board.theme.danger;
    const label = pcName(pc(cellMidi(tuning, cell)), name.includes('♭') ? 'flat' : 'sharp');
    board.setNotes([{ fret: cell.fret, stringIndex: cell.string, displayLabel: label, fillColor: board.theme.panel, strokeColor: danger, strokeWidth: 2, labelColor: danger }]);
    const mine = ++missShown;
    frame.later(MISS_SHOWN_MS, () => {
      if (mine === missShown) board.setNotes([]);
    });
  }

  function onDown(touch: BoardTouch): void {
    if (!liveSince || !touch.cell) return;
    const cell = touch.cell;
    const result = sweep.tap(cell);
    if (result === 'dead') return;
    if (result === 'miss') {
      penalty += SWEEP_PENALTY;
      thud();
      board.flash(cell, board.theme.danger);
      showMiss(cell);
      frame.banner(`+${SWEEP_PENALTY} s`, 'bad');
      return;
    }
    missShown++;
    board.setNotes([]);
    dead.add(cellKey(cell));
    board.setDead(dead);
    board.flash(cell, board.theme.good);
    pluck(cellMidi(tuning, cell), { level: 0.5 });
    if (result === 'board-cleared') return finish(seconds(touch.time));
    if (result === 'next-call') {
      if (kind === 'note') blip(1760, 0.07);
      rest(touch.time);
    } else paint();
  }

  frame.everyFrame((nowMs) => {
    if (liveSince) frame.setClock(formatSeconds(seconds(nowMs)));
  });

  function finish(total: number): void {
    liveSince = 0;
    frame.setClock(formatSeconds(total));
    frame.setPrompt();
    showResult(
      frame,
      ctx,
      {
        mode,
        value: total,
        rank: (kind === 'random' ? rankSweepRandom : rankSweep)(total, sweep.total),
        stats: [
          ['Frets cleared', String(sweep.total)],
          ['Speed rating', `${(total / sweep.total).toFixed(2)} s a fret`],
          ['Wrong taps', String(sweep.mistakes)],
          ['Penalty', `${penalty} s`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.setScore(0);
  frame.root.classList.add('no-score');
  frame.setClock(formatSeconds(0));
  frame.setPrompt(el('span.caps', {}, mode.variant));
  readyPanel(
    frame,
    `${mode.title} · ${mode.variant}`,
    kind === 'note'
      ? [
          `A note is called. Tap every place that plays it, on all six strings: the open strings beside the nut, and frets 1 to ${frame.frets}.`,
          'When they are all gone the next note is called, until the neck is clear.',
          `The clock runs while a note is up. A wrong tap adds ${SWEEP_PENALTY} seconds.`,
        ]
      : [
          `A note is called. Tap one place that plays it, an open string beside the nut or any of frets 1 to ${frame.frets}, and it is gone.`,
          'Every tap brings a new note, until the neck is clear. The places left for each note get fewer as you go.',
          `The clock runs while a note is up. A wrong tap adds ${SWEEP_PENALTY} seconds.`,
        ],
    () => {
      frame.setPrompt(el('b.call.wait', {}, '· · ·'), progress());
      frame.beat(call);
    },
  );

  return frame.teardown;
};
