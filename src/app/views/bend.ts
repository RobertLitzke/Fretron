// The two bending games.
//
// Bend by Ear: hear a target pitch, push the string until your note matches it,
// let go. Nothing on screen says how far you have bent until you do.
//
// Bend Trace: hear a bend that moves over time (a half step, then a whole step,
// say) and watch its line, then play it back. The line goes away as you start;
// only the clock runs across the graph. Judged on how far your pitch was from
// the prompt's across its whole length.
//
// In both, how far the string must be pushed for a semitone differs from one
// prompt to the next (core/bend.ts, semitoneTravel), so it cannot be learned
// as a distance.
//
// In all of them a second finger anywhere on the board while a bend is held
// mutes it and calls it off: it is not scored, and the same bend is asked
// again, so the target can be heard once more first.

import { BendVoice, blip, playContour, pluck } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import {
  BEND_PROMPTS,
  bendLabel,
  centsFromDrag,
  contourAt,
  contourDuration,
  contourPeak,
  dragForCents,
  GRADE_WORDS,
  gradeBend,
  gradeTrace,
  makeBendPrompt,
  makeTracePrompt,
  scoreGrade,
  traceError,
  type BendPrompt,
  type Contour,
  type Grade,
  type TracePrompt,
  type TraceSample,
} from '../../core/bend';
import type { BoardLayout } from '../../core/geometry';
import { asTier, modeById, rankBend, rankTrace, tierWords } from '../../core/modes';
import { pc, pcName, stringName, type Cell } from '../../core/music';
import { Rng } from '../../core/rng';
import { formatMultiplier, GREEN_STEP, NO_STREAK, OK_STEP, type Streak } from '../../core/streak';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { makeFrame, readyPanel, waiting, type Frame } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { freshSeed } from '../ui';

/** A touch shorter than this that barely moved is a slip, not a bend. */
const SLIP_MS = 300;
const SLIP_CENTS = 8;

/** How a miss is written: "+12 ¢", "−8 ¢". */
export function signedCents(cents: number): string {
  const rounded = Math.round(cents);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)} ¢`;
}

export function gradeColor(frame: Frame, grade: Grade): string {
  const theme = frame.board.theme;
  return grade === 'bullseye' || grade === 'intune' ? theme.good : grade === 'acceptable' ? theme.pivot : theme.danger;
}

/** Whether a touch has landed on the note to be bent, drawn `offsetY` pixels from its place. */
export function onPuck(frame: Frame, cell: Cell, touch: BoardTouch, offsetY = 0): boolean {
  const centre = frame.board.centre(cell);
  return Math.hypot(touch.x - centre.x, touch.y - centre.y - offsetY) <= frame.board.noteRadius * 2.6;
}

/**
 * Once a bend is over, the two to compare: the prompt, and what was played.
 * Tapping the note plays the second too.
 */
export function reviewButtons(target: () => void, yours: () => void): HTMLElement {
  const play = (label: string, run: () => void, kind: string) =>
    el(`button.btn.btn-small.review-play.${kind}`, { type: 'button', onclick: run }, label);
  return el('span.review', {}, play('▶ Target', target, 'target'), play('▶ Yours', yours, 'yours'));
}

/** Draw the note being bent, pulled `offsetY` pixels across the neck, and its string with it. */
/** How the streak works in the bend games, for their ready panels. */
export const STREAK_LINE = `Each green bend adds ×${GREEN_STEP} to the multiplier and each tan one ×${OK_STEP}, after it is scored. An off bend puts it back to ×1.`;

/** The streak meter in the bend games: the bends in a row, and the multiplier they give. */
export function bendStreak(frame: Frame, streak: Streak): void {
  frame.setStreak(streak.run, formatMultiplier(streak.mult), BEND_PROMPTS - 1);
}

/** The points a bend won, floated up from the note; a bullseye's in gold. An off bend wins none, and its broken streak says so. */
export function popGrade(frame: Frame, grade: Grade, points: number, at: readonly Cell[] | { x: number; y: number }): void {
  if (points) frame.pop(`+${points.toLocaleString('en-US')}`, at, grade === 'bullseye' ? 'gold' : 'good');
}

/** Where the note is on the board, pushed as far as it was bent. */
export function bentTo(frame: Frame, cell: Cell, offsetY: number): { x: number; y: number } {
  const { x, y } = frame.board.centre(cell);
  return { x, y: y + offsetY };
}

function paintPuck(frame: Frame, cell: Cell, label: string, offsetY: number, held: boolean): void {
  const { board } = frame;
  board.setDeflection(offsetY ? { cell, offsetY } : null);
  board.setNotes([
    {
      fret: cell.fret,
      stringIndex: cell.string,
      displayLabel: label,
      fillColor: held ? board.theme.cyan : board.theme.orange,
      glow: held ? board.theme.cyan : board.theme.orange,
      radiusScale: 1.15,
      offsetY,
    },
  ]);
}

export const bendView: View = (root, ctx) => {
  const tier = asTier(ctx.params.tier);
  const mode = modeById(`bend-${tier}`)!;
  const rng = new Rng(freshSeed());
  const voice = new BendVoice();
  const fx = new BendFx();

  let asked = 0;
  let score = 0;
  let streak = NO_STREAK;
  let missTotal = 0;
  let secondsTotal = 0;
  let prompt: BendPrompt | null = null;
  let phase: 'idle' | 'aim' | 'bending' | 'shown' = 'idle';
  let aimSince = 0;
  let finger = -1;
  let downAt = 0;
  let downY = 0;
  let offsetY = 0;
  let cents = 0;
  /** What to draw once the finger has lifted. */
  let shown: { direction: number; error: number; grade: Grade; cents: number } | null = null;

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');

  /** Pixels of push for a semitone, for this prompt on this screen. */
  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);

  board.overlay = (g, layout, start) => {
    if (!prompt || !shown) return;
    const centre = layout.center(prompt.cell, start);
    const targetY = centre.y + shown.direction * dragForCents(prompt.semis * 100, semitonePx());
    const half = board.noteRadius * 2.1;
    g.save();
    // Where the string had to be held for the target pitch.
    g.strokeStyle = board.theme.orange;
    g.shadowColor = board.theme.orange;
    g.shadowBlur = 10;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(centre.x - half, targetY);
    g.lineTo(centre.x + half, targetY);
    g.stroke();
    g.shadowBlur = 0;
    g.font = `600 12px Orbitron, sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = board.theme.orange;
    g.fillText(name(prompt.to), centre.x + half + 8, targetY);
    g.font = `700 26px Orbitron, sans-serif`;
    g.fillStyle = gradeColor(frame, shown.grade);
    g.textAlign = 'right';
    g.fillText(signedCents(shown.error), centre.x - half - 10 + fx.shake(), centre.y + offsetY);
    g.restore();
    fx.draw(g, centre.x, centre.y + offsetY, board.noteRadius * 1.15, gradeColor(frame, shown.grade));
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
    voice.stop();
    phase = 'aim';
    finger = -1;
    offsetY = 0;
    cents = 0;
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
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
    offsetY = 0;
    cents = 0;
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
      if (touch.id !== finger) cancel();
      return;
    }
    // Over: the note plays back what was played, and the rest of the board moves on.
    if (phase === 'shown' && prompt && onPuck(frame, prompt.cell, touch, offsetY)) return hearYours();
    if (frame.takeNext(true)) return;
    if (phase !== 'aim' || !prompt || !onPuck(frame, prompt.cell, touch)) return;
    phase = 'bending';
    finger = touch.id;
    downAt = touch.time;
    downY = touch.y;
    offsetY = 0;
    cents = 0;
    voice.start(prompt.from);
    paintPuck(frame, prompt.cell, name(prompt.from), 0, true);
  }

  function onMove(touch: BoardTouch): void {
    if (phase !== 'bending' || touch.id !== finger || !prompt) return;
    const drag = touch.y - downY;
    // Pushing the string either way across the neck raises its pitch.
    cents = centsFromDrag(drag, semitonePx());
    offsetY = Math.sign(drag) * dragForCents(cents, semitonePx());
    voice.setCents(cents);
    paintPuck(frame, prompt.cell, name(prompt.from), offsetY, true);
  }

  function onUp(touch: BoardTouch): void {
    if (phase !== 'bending' || touch.id !== finger || !prompt) return;
    if (cents < SLIP_CENTS && touch.time - downAt < SLIP_MS) {
      voice.stop();
      phase = 'aim';
      paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
      return;
    }
    const error = cents - prompt.semis * 100;
    const grade = gradeBend(error);
    const scored = scoreGrade(grade, streak);
    if (grade === 'bullseye') voice.bloom();
    else voice.release();
    score += scored.points;
    streak = scored.streak;
    missTotal += Math.abs(error);
    secondsTotal += (touch.time - aimSince) / 1000;
    shown = { direction: offsetY < 0 ? -1 : offsetY > 0 ? 1 : -1, error, grade, cents };
    phase = 'shown';
    fx.burst(grade);
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearTarget, hearYours));
    frame.setScore(score);
    bendStreak(frame, streak);
    popGrade(frame, grade, scored.points, bentTo(frame, prompt.cell, offsetY));
    frame.banner(GRADE_WORDS[grade], grade === 'off' ? 'bad' : 'good');
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
        value: score,
        rank: rankBend(mean),
        stats: [
          ['Pitch accuracy', `${mean.toFixed(1)} ¢ off`],
          ['Speed rating', `${(secondsTotal / BEND_PROMPTS).toFixed(1)} s`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  bendStreak(frame, NO_STREAK);
  frame.setPrompt(el('span.caps', {}, tierWords(tier)));
  readyPanel(
    frame,
    `${mode.title} · ${tierWords(tier)}`,
    [
      'You hear the pitch to reach. Then hold the lit note and drag it across the strings: the further you push, the higher it goes.',
      'There is no meter, and no two bends take the same push. Listen, and let go when your note matches.',
      'To hear the target again mid-bend, tap anywhere else with another finger: the bend is muted and called off, and you can try it again.',
      'Afterwards, tap the note to hear where you let go, and compare it with the target.',
      `${BEND_PROMPTS} bends. Within 5 cents is a bullseye.`,
      STREAK_LINE,
    ],
    () => {
      blip();
      next();
    },
  );

  return () => {
    voice.stop();
    frame.teardown();
  };
};

// --- Bend Trace ----------------------------------------------------------------

/** How much of the board's width the graph takes, on whichever side the note is not. */
const GRAPH_WIDTH = 0.44;

export const traceView: View = (root, ctx) => {
  const tier = asTier(ctx.params.tier);
  const mode = modeById(`trace-${tier}`)!;
  const rng = new Rng(freshSeed());
  const voice = new BendVoice();
  const fx = new BendFx();

  let asked = 0;
  let score = 0;
  let streak = NO_STREAK;
  let missTotal = 0;
  let best = Infinity;
  let prompt: TracePrompt | null = null;
  let phase: 'idle' | 'listen' | 'ready' | 'playing' | 'shown' = 'idle';
  /** performance.now() when the prompt, or the playing back of it, began. */
  let listenSince = 0;
  let playSince = 0;
  let cutPrompt: (() => void) | null = null;
  let finger = -1;
  let downY = 0;
  let offsetY = 0;
  let cents = 0;
  let peak = 0;
  let samples: TraceSample[] = [];
  let shown: { mean: number; grade: Grade } | null = null;
  /** Once a bend is over, which line is being played back, and since when. */
  let review: { line: 'target' | 'yours'; since: number } | null = null;
  let promptLine: HTMLElement[] = [];

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');

  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);

  board.overlay = (g, layout, start) => {
    if (!prompt) return;
    drawGraph(g, layout, start);
    if (shown) {
      const centre = layout.center(prompt.cell, start);
      fx.draw(g, centre.x, centre.y, board.noteRadius * 1.15, gradeColor(frame, shown.grade));
    }
  };

  function drawGraph(g: CanvasRenderingContext2D, layout: BoardLayout, start: number): void {
    const contour = prompt!.contour;
    const duration = contourDuration(contour);
    // Beside the note, not over it: on the body side if the note is toward the nut.
    const puckAt = (prompt!.cell.fret - 0.5 - start) / layout.visible;
    const from = puckAt < 0.5 ? 1 - GRAPH_WIDTH - 0.015 : 0.015;
    const xa = layout.x(start + layout.visible * from, start);
    const xb = layout.x(start + layout.visible * (from + GRAPH_WIDTH), start);
    const left = Math.min(xa, xb);
    const width = Math.abs(xb - xa);
    const top = layout.topY - layout.spacing * 0.35;
    const height = layout.bottomY - layout.topY + layout.spacing * 0.7;
    const theme = board.theme;

    g.save();
    g.fillStyle = 'rgba(3, 6, 15, 0.9)';
    g.strokeStyle = theme.fretBold;
    g.lineWidth = 1;
    g.fillRect(left, top, width, height);
    g.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);

    const padL = 34;
    const padR = 12;
    const padT = 22;
    const padB = 16;
    const ceiling = Math.max(200, contourPeak(contour)) + 50;
    const tx = (t: number) => left + padL + (Math.min(duration, Math.max(0, t)) / duration) * (width - padL - padR);
    const cy = (c: number) => top + height - padB - (Math.min(ceiling, Math.max(0, c)) / ceiling) * (height - padT - padB);

    // A line for each half step, named the way a bend is written.
    g.font = `600 11px Orbitron, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let semis = 0; semis * 100 <= ceiling; semis++) {
      const y = Math.round(cy(semis * 100)) + 0.5;
      g.strokeStyle = theme.fret;
      g.setLineDash(semis === 0 ? [] : [3, 4]);
      g.beginPath();
      g.moveTo(left + padL, y);
      g.lineTo(left + width - padR, y);
      g.stroke();
      g.fillStyle = theme.muted;
      g.fillText(bendLabel(semis), left + padL - 6, y);
    }
    g.setLineDash([]);

    // The line of the prompt. It is there to study and to listen along with,
    // and it comes back at the end; while the bend is being played it is gone,
    // so the timing has to be remembered and not read off.
    if (phase !== 'playing') {
      g.strokeStyle = theme.orange;
      g.shadowColor = theme.orange;
      g.shadowBlur = 8;
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.beginPath();
      contour.points.forEach((p, i) => (i ? g.lineTo(tx(p.t), cy(p.cents)) : g.moveTo(tx(p.t), cy(p.cents))));
      g.stroke();
      g.shadowBlur = 0;
    }

    // What was played, once it is over.
    if (shown && samples.length) {
      g.strokeStyle = theme.cyan;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx(0), cy(0));
      for (const s of samples) g.lineTo(tx(s.t), cy(s.cents));
      g.lineTo(tx(duration), cy(samples[samples.length - 1].cents));
      g.stroke();
      g.font = `700 16px Orbitron, sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = gradeColor(frame, shown.grade);
      g.fillText(`${Math.round(shown.mean)} ¢ off on average`, left + padL + fx.shake(), top + 12);
    } else {
      g.font = `600 11px Orbitron, sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = theme.muted;
      g.fillText(phase === 'playing' ? 'PLAY' : phase === 'listen' ? 'LISTEN' : 'YOUR TURN: HOLD THE NOTE', left + padL, top + 12);
    }

    const nowMs = performance.now();
    const playhead =
      phase === 'listen'
        ? (nowMs - listenSince) / 1000
        : phase === 'playing'
          ? (nowMs - playSince) / 1000
          : review
            ? (nowMs - review.since) / 1000
            : -1;
    if (playhead >= 0 && playhead <= duration) {
      const x = tx(playhead);
      g.strokeStyle = phase === 'playing' || review?.line === 'yours' ? theme.cyan : theme.text;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, top + padT - 6);
      g.lineTo(x, top + height - padB);
      g.stroke();
      if (phase === 'listen') {
        g.fillStyle = theme.orange;
        g.beginPath();
        g.arc(x, cy(contourAt(contour, playhead)), 5, 0, 2 * Math.PI);
        g.fill();
      }
    }
    g.restore();
  }

  function listen(): void {
    if (!prompt || phase === 'shown') return;
    cancel();
    cutPrompt?.();
    cutPrompt = playContour(prompt.from, prompt.contour);
    listenSince = performance.now() + 50;
    phase = 'listen';
    const mine = prompt;
    frame.later(contourDuration(prompt.contour) * 1000 + 120, () => {
      if (prompt === mine && phase === 'listen') phase = 'ready';
      board.invalidate();
    });
  }

  /** Mute the bend being played and put the note back, unscored, to be tried again. */
  function cancel(): void {
    if (phase !== 'playing' || !prompt) return;
    voice.stop();
    phase = 'ready';
    finger = -1;
    offsetY = 0;
    cents = 0;
    peak = 0;
    samples = [];
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    frame.banner('Bend cancelled');
  }

  /** Once a bend is over, play back the prompt or what was played, with the clock running across the graph. */
  function hearAgain(line: 'target' | 'yours'): void {
    if (!prompt || phase !== 'shown') return;
    cutPrompt?.();
    cutPrompt = playContour(prompt.from, line === 'target' ? prompt.contour : playedContour());
    review = { line, since: performance.now() + 50 };
  }

  /** What was played, as a contour to play back: held to the end of the prompt's time, as it was scored. */
  function playedContour(): Contour {
    const duration = contourDuration(prompt!.contour);
    const points = samples.filter((s) => s.t <= duration);
    const last = points[points.length - 1];
    if (last.t < duration) points.push({ t: duration, cents: last.cents });
    return { points, stops: [] };
  }

  /** Clear the board, take a beat, then put up the next bend. */
  function next(): void {
    if (asked >= BEND_PROMPTS) return finish();
    cutPrompt?.();
    fx.clear();
    shown = null;
    review = null;
    prompt = null;
    phase = 'idle';
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt(...waiting(`${asked + 1} / ${BEND_PROMPTS}`));
    frame.beat(() => void present());
  }

  async function present(): Promise<void> {
    samples = [];
    offsetY = 0;
    cents = 0;
    prompt = makeTracePrompt(rng, tuning, tier, frame.frets);
    // For tools/devkit.js, which plays a prompt back to check the scoring.
    if (import.meta.env.DEV) (window as unknown as { __prompt?: TracePrompt }).__prompt = prompt;
    asked++;
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    promptLine = [
      el('span.caps', {}, `${asked} / ${BEND_PROMPTS}`),
      el('b.call.pop', {}, `Trace ${prompt.contour.stops.map((s) => (s === 0 ? 'release' : bendLabel(s))).join(' → ')}`),
      el('span.call-sub', {}, `from ${name(prompt.from)} · fret ${prompt.cell.fret}, ${stringName(tuning, prompt.cell.string)} string`),
    ];
    frame.setPrompt(...promptLine);
    board.show([prompt.cell]);
    await board.whenSettled();
    if (frame.gone) return;
    frame.setAction('Hear again', listen);
    listen();
  }

  function onDown(touch: BoardTouch): void {
    // A second finger while the bend is played calls it off.
    if (phase === 'playing') {
      if (touch.id !== finger) cancel();
      return;
    }
    // Over: the note plays back what was played, and the rest of the board moves on.
    if (phase === 'shown' && prompt && onPuck(frame, prompt.cell, touch)) return hearAgain('yours');
    if (frame.takeNext(true)) return;
    if ((phase !== 'listen' && phase !== 'ready') || !prompt || !onPuck(frame, prompt.cell, touch)) return;
    cutPrompt?.();
    phase = 'playing';
    finger = touch.id;
    downY = touch.y;
    playSince = touch.time;
    offsetY = 0;
    cents = 0;
    peak = 0;
    samples = [{ t: 0, cents: 0 }];
    voice.start(prompt.from);
    paintPuck(frame, prompt.cell, name(prompt.from), 0, true);
  }

  function onMove(touch: BoardTouch): void {
    if (phase !== 'playing' || touch.id !== finger || !prompt) return;
    const drag = touch.y - downY;
    cents = centsFromDrag(drag, semitonePx());
    peak = Math.max(peak, cents);
    offsetY = Math.sign(drag) * dragForCents(cents, semitonePx());
    voice.setCents(cents);
    samples.push({ t: (touch.time - playSince) / 1000, cents });
    paintPuck(frame, prompt.cell, name(prompt.from), offsetY, true);
  }

  function onUp(touch: BoardTouch): void {
    if (phase !== 'playing' || touch.id !== finger || !prompt) return;
    const seconds = (touch.time - playSince) / 1000;
    if (peak < SLIP_CENTS && seconds * 1000 < SLIP_MS) {
      voice.stop();
      phase = 'ready';
      paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
      return;
    }
    // Letting go early leaves the rest of the prompt unplayed: an unbent string.
    if (seconds < contourDuration(prompt.contour)) samples.push({ t: seconds, cents: 0 });
    settle();
  }

  function settle(): void {
    if (!prompt) return;
    voice.release();
    const mean = traceError(prompt.contour, samples);
    const grade = gradeTrace(mean);
    const scored = scoreGrade(grade, streak);
    score += scored.points;
    streak = scored.streak;
    missTotal += mean;
    best = Math.min(best, mean);
    shown = { mean, grade };
    phase = 'shown';
    fx.burst(grade);
    finger = -1;
    frame.setAction(null);
    frame.setPrompt(
      ...promptLine,
      reviewButtons(
        () => hearAgain('target'),
        () => hearAgain('yours'),
      ),
    );
    frame.setScore(score);
    bendStreak(frame, streak);
    popGrade(frame, grade, scored.points, [prompt.cell]);
    frame.banner(GRADE_WORDS[grade], grade === 'off' ? 'bad' : 'good');
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    frame.offerNext(next);
  }

  frame.everyFrame((nowMs) => {
    if (fx.tick(nowMs)) board.invalidate();
    if (review && prompt && (nowMs - review.since) / 1000 > contourDuration(prompt.contour)) {
      review = null;
      board.invalidate();
    }
    if (phase === 'listen' || phase === 'playing' || review) board.invalidate();
    // The prompt's time is up: the bend is over whether or not the finger has lifted.
    if (phase === 'playing' && prompt && (nowMs - playSince) / 1000 >= contourDuration(prompt.contour)) settle();
  });

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
        value: score,
        rank: rankTrace(mean),
        stats: [
          ['Pitch accuracy', `${mean.toFixed(1)} ¢ off`],
          ['Best trace', `${best.toFixed(1)} ¢ off`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  bendStreak(frame, NO_STREAK);
  frame.setPrompt(el('span.caps', {}, tierWords(tier)));
  readyPanel(
    frame,
    `${mode.title} · ${tierWords(tier)}`,
    [
      'You hear a bend that moves: up a half step, on to a whole step, and so on. The graph shows its shape and timing.',
      'Then hold the lit note and play it back. The clock starts when you touch, and the line disappears: play it from memory.',
      'Lost it? Tap anywhere else with another finger to mute the bend and call it off, then hear it again and start over.',
      `${BEND_PROMPTS} bends, scored on how far your pitch was from the prompt along the way. Both lines are shown afterwards: tap the note to hear yours again.`,
      STREAK_LINE,
    ],
    () => {
      blip();
      next();
    },
  );

  return () => {
    cutPrompt?.();
    voice.stop();
    frame.teardown();
  };
};
