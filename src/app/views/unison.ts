// Unison Bends: a note on one string is held with one finger and rings; the
// string below is bent up to meet it with another. The two sound together, so
// the bend is tuned by ear the way a guitarist tunes one on stage: the beating
// between the two notes slows, and stops when they are one. The held note can
// also be tapped to hear it, for a player with one hand on the phone.

import { blip, BendVoice, pluck } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { NoteRenderData } from '../../board/renderer';
import { BEND_PROMPTS, bendLabel, dragForCents, gradeBend, makeUnisonPrompt, type Grade, type UnisonPrompt } from '../../core/bend';
import { bendTargets, modeById, starsBend } from '../../core/modes';
import { pc, pcName, sameCell, stringName } from '../../core/music';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { BendInput, BendScore, bentTo, drawLanding, onPuck, reviewButtons, STREAK_LINE } from '../game/bendInput';
import { makeFrame, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { freshSeed } from '../ui';

export const unisonView: View = (root, ctx) => {
  const mode = modeById('unison')!;
  const rng = new Rng(freshSeed());
  const fx = new BendFx();

  let asked = 0;
  let missTotal = 0;
  let secondsTotal = 0;
  let prompt: UnisonPrompt | null = null;
  let phase: 'idle' | 'aim' | 'bending' | 'shown' = 'idle';
  let aimSince = 0;
  let shown: { direction: number; error: number; grade: Grade; cents: number } | null = null;
  /** The held note: the touch holding it, or -1, and its voice. */
  let holding = -1;
  const drone = new BendVoice();
  /** Whether the held note rang at some point during this bend, and how many bends it did: the point of the game, so it is counted. */
  let heardTogether = false;
  let together = 0;

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');
  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);

  /** Both notes: the held one on the string above (lit while it rings), and the one being bent, pulled across the neck. */
  function paint(held: boolean): void {
    if (!prompt) return;
    const { theme } = board;
    const ringing = holding !== -1;
    const notes: NoteRenderData[] = [
      {
        fret: prompt.ref.fret,
        stringIndex: prompt.ref.string,
        displayLabel: name(prompt.to),
        fillColor: ringing ? theme.cyan : 'transparent',
        strokeColor: theme.cyan,
        strokeWidth: 2,
        labelColor: ringing ? undefined : theme.cyan,
        glow: ringing ? theme.cyan : undefined,
        radiusScale: 1.05,
      },
      {
        fret: prompt.cell.fret,
        stringIndex: prompt.cell.string,
        displayLabel: name(prompt.from),
        fillColor: held ? theme.cyan : theme.orange,
        glow: held ? theme.cyan : theme.orange,
        radiusScale: 1.15,
        offsetY: input.offsetY,
      },
    ];
    board.setDeflection(input.offsetY ? { cell: prompt.cell, offsetY: input.offsetY } : null);
    board.setNotes(notes);
  }

  const input = new BendInput({ semitonePx, paint });
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

  /** The held note, struck once: for a player who would rather not hold it. */
  function hearHeld(): void {
    if (prompt) pluck(prompt.to, { level: 0.55, ring: 0.6 });
  }

  function hearYours(): void {
    if (prompt && shown) pluck(prompt.from + shown.cents / 100, { level: 0.55, ring: 0.6 });
  }

  function startHold(touch: BoardTouch): void {
    if (!prompt) return;
    holding = touch.id;
    drone.start(prompt.to);
    if (phase === 'bending') heardTogether = true;
    paint(phase === 'bending');
  }

  function endHold(): void {
    if (holding === -1) return;
    holding = -1;
    drone.release();
    paint(phase === 'bending');
  }

  function cancel(): void {
    if (phase !== 'bending' || !prompt) return;
    phase = 'aim';
    input.drop();
    frame.banner('Bend cancelled');
  }

  let promptLine: HTMLElement[] = [];

  function next(): void {
    if (asked >= BEND_PROMPTS) return finish();
    fx.clear();
    shown = null;
    prompt = null;
    phase = 'idle';
    endHold();
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt(...waiting(`${asked + 1} / ${BEND_PROMPTS}`));
    frame.beat(() => void present());
  }

  async function present(): Promise<void> {
    input.reset();
    prompt = makeUnisonPrompt(rng, tuning, frame.frets);
    if (import.meta.env.DEV) (window as unknown as { __prompt?: UnisonPrompt }).__prompt = prompt;
    asked++;
    heardTogether = false;
    paint(false);
    promptLine = [
      el('span.caps', {}, `${asked} / ${BEND_PROMPTS}`),
      el('b.call.pop', {}, `Bend ${bendLabel(prompt.semis)}`),
      el(
        'span.call-sub',
        {},
        `${name(prompt.from)} → ${name(prompt.to)} · hold fret ${prompt.ref.fret}, bend fret ${prompt.cell.fret} on the ${stringName(tuning, prompt.cell.string)} string`,
      ),
    ];
    frame.setPrompt(...promptLine);
    board.show([prompt.cell, prompt.ref]);
    await board.whenSettled();
    if (frame.gone) return;
    // Nothing is played first: the held note is the reference, and it is the player's to sound.
    frame.setAction('Hear held note', hearHeld);
    phase = 'aim';
    aimSince = performance.now();
  }

  function onDown(touch: BoardTouch): void {
    if (!prompt) {
      frame.takeNext(true);
      return;
    }
    // The held note first, in any phase but the review: a finger on it makes it ring.
    if ((phase === 'aim' || phase === 'bending') && holding === -1 && touch.cell && sameCell(touch.cell, prompt.ref)) return startHold(touch);
    if (phase === 'bending') {
      // Another finger anywhere else while the bend is held calls it off.
      if (!input.holds(touch) && touch.id !== holding) cancel();
      return;
    }
    if (phase === 'shown' && onPuck(frame, prompt.cell, touch, input.offsetY)) return hearYours();
    if (frame.takeNext(true)) return;
    if (phase !== 'aim' || !onPuck(frame, prompt.cell, touch)) return;
    phase = 'bending';
    if (holding !== -1) heardTogether = true;
    input.start(touch, prompt.from);
  }

  function onMove(touch: BoardTouch): void {
    if (phase === 'bending') input.move(touch);
  }

  function onUp(touch: BoardTouch): void {
    if (touch.id === holding) return endHold();
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
    if (heardTogether) together++;
    shown = { direction: offsetY > 0 ? 1 : -1, error, grade, cents };
    phase = 'shown';
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearHeld, hearYours));
    tally.land(grade, bentTo(frame, prompt.cell, offsetY));
    board.invalidate();
    frame.offerNext(next);
  }

  function finish(): void {
    prompt = null;
    endHold();
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
          ['Held while bending', `${together} / ${BEND_PROMPTS}`],
          ['Speed rating', `${(secondsTotal / BEND_PROMPTS).toFixed(1)} s`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.setPrompt(el('span.caps', {}, mode.variant));
  readyPanel(
    frame,
    `${mode.title} · ${mode.variant}`,
    [
      'Hold the blue note with one finger so it rings, and push the orange note up with another until the two are one: the beating slows and stops. Let go when they match.',
      `${BEND_PROMPTS} bends; within 5 cents is a bullseye. The held note can also be tapped to hear it. Another finger elsewhere calls a bend off.`,
      STREAK_LINE,
    ],
    bendTargets(),
    () => {
      blip();
      next();
    },
  );

  return () => {
    drone.stop();
    input.stop();
    frame.teardown();
  };
};
