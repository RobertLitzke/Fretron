// Bend by Ear: hear a target pitch, push the string until your note matches it,
// let go. Nothing on screen says how far you have bent until you do.
//
// How far the string must be pushed for a semitone differs from one prompt to
// the next (core/bend.ts, semitoneTravel), so it cannot be learned as a
// distance. The touch and the scoring are shared with the other bending games
// (game/bendInput.ts); Bend Trace is in trace.ts.

import { blip, pluck } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import { BEND_PROMPTS, bendLabel, dragForCents, gradeBend, makeBendPrompt, type BendPrompt, type Grade } from '../../core/bend';
import { asTier, bendTargets, modeById, starsBend, tierWords } from '../../core/modes';
import { pc, pcName, stringName } from '../../core/music';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { BendInput, BendScore, bentTo, drawLanding, onPuck, paintPuck, reviewButtons, STREAK_LINE } from '../game/bendInput';
import { makeFrame, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { freshSeed } from '../ui';

export const bendView: View = (root, ctx) => {
  const tier = asTier(ctx.params.tier);
  const mode = modeById(`bend-${tier}`)!;
  const rng = new Rng(freshSeed());
  const fx = new BendFx();

  let asked = 0;
  let missTotal = 0;
  let secondsTotal = 0;
  let prompt: BendPrompt | null = null;
  let phase: 'idle' | 'aim' | 'bending' | 'shown' = 'idle';
  let aimSince = 0;
  /** What to draw once the finger has lifted. */
  let shown: { direction: number; error: number; grade: Grade; cents: number } | null = null;

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');

  /** Pixels of push for a semitone, for this prompt on this screen. */
  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);

  const input = new BendInput({
    semitonePx,
    paint: (held) => {
      if (prompt) paintPuck(frame, prompt.cell, name(prompt.from), input.offsetY, held);
    },
  });
  const tally = new BendScore(frame, fx);

  board.overlay = (g, layout, start) => {
    if (!prompt || !shown) return;
    const centre = layout.center(prompt.cell, start);
    drawLanding(g, frame, fx, centre, {
      targetY: centre.y + shown.direction * dragForCents(prompt.semis * 100, semitonePx()),
      offsetY: input.offsetY,
      error: shown.error,
      grade: shown.grade,
      label: name(prompt.to),
    });
  };
  frame.everyFrame((nowMs) => {
    if (fx.tick(nowMs)) board.invalidate();
  });

  function hearTarget(): void {
    if (phase === 'bending') cancel();
    if (prompt) pluck(prompt.to, { level: 0.55, ring: 0.6 });
  }

  /** The note where it was let go, struck the same way as the target. */
  function hearYours(): void {
    if (prompt && shown) pluck(prompt.from + shown.cents / 100, { level: 0.55, ring: 0.6 });
  }

  /** Mute the bend being held and put the note back, unscored, to be tried again. */
  function cancel(): void {
    if (phase !== 'bending' || !prompt) return;
    phase = 'aim';
    input.drop();
    frame.banner('Bend cancelled');
  }

  let promptLine: HTMLElement[] = [];

  /** Clear the board, take a beat, then put up the next bend. */
  function next(): void {
    if (asked >= BEND_PROMPTS) return finish();
    fx.clear();
    shown = null;
    prompt = null;
    phase = 'idle';
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt(...waiting(`${asked + 1} / ${BEND_PROMPTS}`));
    frame.beat(() => void present());
  }

  async function present(): Promise<void> {
    input.reset();
    prompt = makeBendPrompt(rng, tuning, tier, frame.frets);
    // For tools/devkit.js, which plays a prompt back to check the scoring.
    if (import.meta.env.DEV) (window as unknown as { __prompt?: BendPrompt }).__prompt = prompt;
    asked++;
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    promptLine = [
      el('span.caps', {}, `${asked} / ${BEND_PROMPTS}`),
      el('b.call.pop', {}, `Bend ${bendLabel(prompt.semis)}`),
      el(
        'span.call-sub',
        {},
        `${name(prompt.from)} → ${name(prompt.to)} · fret ${prompt.cell.fret}, ${stringName(tuning, prompt.cell.string)} string`,
      ),
    ];
    frame.setPrompt(...promptLine);
    board.show([prompt.cell]);
    await board.whenSettled();
    if (frame.gone) return;
    hearTarget();
    frame.setAction('Hear target', hearTarget);
    phase = 'aim';
    aimSince = performance.now();
  }

  function onDown(touch: BoardTouch): void {
    // A second finger while the bend is held calls it off.
    if (phase === 'bending') {
      if (!input.holds(touch)) cancel();
      return;
    }
    // Over: the note plays back what was played, and the rest of the board moves on.
    if (phase === 'shown' && prompt && onPuck(frame, prompt.cell, touch, input.offsetY)) return hearYours();
    if (frame.takeNext(true)) return;
    if (phase !== 'aim' || !prompt || !onPuck(frame, prompt.cell, touch)) return;
    phase = 'bending';
    input.start(touch, prompt.from);
  }

  function onMove(touch: BoardTouch): void {
    if (phase === 'bending') input.move(touch);
  }

  function onUp(touch: BoardTouch): void {
    if (phase !== 'bending' || !input.holds(touch) || !prompt) return;
    if (input.slipped(touch)) {
      phase = 'aim';
      input.drop();
      return;
    }
    const { cents, offsetY } = input;
    const error = cents - prompt.semis * 100;
    const grade = gradeBend(error);
    input.letGo(grade);
    missTotal += Math.abs(error);
    secondsTotal += (touch.time - aimSince) / 1000;
    shown = { direction: offsetY > 0 ? 1 : -1, error, grade, cents };
    phase = 'shown';
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearTarget, hearYours));
    tally.land(grade, bentTo(frame, prompt.cell, offsetY));
    board.invalidate();
    frame.offerNext(next);
  }

  function finish(): void {
    prompt = null;
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt();
    const mean = missTotal / BEND_PROMPTS;
    showResult(
      frame,
      ctx,
      {
        mode,
        value: tally.points,
        stars: starsBend(mean),
        targets: bendTargets(),
        stats: [
          ['Pitch accuracy', `${mean.toFixed(1)} ¢ off`],
          ['Speed rating', `${(secondsTotal / BEND_PROMPTS).toFixed(1)} s`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.setPrompt(el('span.caps', {}, tierWords(tier)));
  readyPanel(
    frame,
    `${mode.title} · ${tierWords(tier)}`,
    [
      'Hear the target, then push the lit note up and let go when it matches. No meter: just listen.',
      `${BEND_PROMPTS} bends; within 5 cents is a bullseye. Another finger calls a bend off.`,
      STREAK_LINE,
    ],
    bendTargets(),
    () => {
      blip();
      next();
    },
  );

  return () => {
    input.stop();
    frame.teardown();
  };
};
