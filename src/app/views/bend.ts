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

import { BendVoice, blip, heardAt, now, playContour, pluck, unlock } from '../../audio/audio';
import { BAR, Metronome } from '../../audio/beat';
import type { BoardTouch } from '../../board/board';
import {
  BEND_PROMPTS,
  bendLabel,
  centsFromDrag,
  contourAt,
  contourDuration,
  contourPeak,
  contourWords,
  dragForCents,
  GRADE_WORDS,
  gradeBend,
  gradeTrace,
  makeBendPrompt,
  makeTracePrompt,
  scoreGrade,
  comboMultiplier,
  MAX_COMBO,
  traceError,
  TRACE_BPM,
  type BendPrompt,
  type Contour,
  type Grade,
  type TracePrompt,
  type TraceSample,
} from '../../core/bend';
import type { BoardLayout } from '../../core/geometry';
import { asTier, modeById, rankBend, rankTrace, tierWords, type Mode } from '../../core/modes';
import { pc, pcName, stringName, type Cell, type Tuning } from '../../core/music';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { BEAT_STYLES, type BeatStyle } from '../../core/storage';
import { makeFrame, panelOption, readyPanel, waiting, type Frame } from '../game/frame';
import { showResult } from '../game/results';
import type { View, ViewContext } from '../router';
import { getSave, updateSave } from '../store';
import { freshSeed, segmented } from '../ui';

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
/** The streak meter in the bend games: the steps of the streak, and the multiplier they give. */
export function bendStreak(frame: Frame, combo: number): void {
  frame.setStreak(combo - 1, `×${comboMultiplier(combo).toFixed(1)}`, MAX_COMBO - 1);
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
  let combo = 1;
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
    const scored = scoreGrade(grade, combo);
    if (grade === 'bullseye') voice.bloom();
    else voice.release();
    score += scored.points;
    combo = scored.combo;
    missTotal += Math.abs(error);
    secondsTotal += (touch.time - aimSince) / 1000;
    shown = { direction: offsetY < 0 ? -1 : offsetY > 0 ? 1 : -1, error, grade, cents };
    phase = 'shown';
    fx.burst(grade);
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearTarget, hearYours));
    frame.setScore(score);
    bendStreak(frame, combo);
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

  bendStreak(frame, 1);
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

/** A game of traces: Bend Trace's tiers, and the song phrases (song.ts). */
export interface TraceGame {
  mode: Mode;
  /** The tier, or the song: under the title on the ready panel. */
  subtitle: string;
  bpm: number;
  prompts: number;
  /** The `index`th prompt of the run, from 0, on this board's neck. */
  makePrompt(index: number, tuning: Tuning, frets: number): TracePrompt;
  /** What the prompt is called, above its bends: a phrase's name. */
  caption?(index: number): string | null;
  lines: readonly string[];
}

export const traceView: View = (root, ctx) => {
  const tier = asTier(ctx.params.tier);
  const rng = new Rng(freshSeed());
  return traceGame(root, ctx, {
    mode: modeById(`trace-${tier}`)!,
    subtitle: tierWords(tier),
    bpm: TRACE_BPM[tier],
    prompts: BEND_PROMPTS,
    makePrompt: (_, tuning, frets) => makeTracePrompt(rng, tuning, tier, frets),
    lines: [
      'Hear a bend that moves in time with the beat, and see its shape, with a line on each beat. Some are pushed at once, some leaned into; a pre-bend starts bent, so push as you touch.',
      'Then hold the lit note on a beat and play it back from memory: the line disappears. Tap with another finger to call it off and hear it again.',
      `${BEND_PROMPTS} bends, scored on how far your pitch was from the prompt along the way. Tap the note afterwards to hear yours.`,
    ],
  });
};

export function traceGame(root: HTMLElement, ctx: ViewContext, game: TraceGame): () => void {
  const { mode, bpm } = game;
  const voice = new BendVoice();
  const fx = new BendFx();
  let metro = new Metronome(getSave().beat);
  const beatMs = 60_000 / bpm;

  let asked = 0;
  let score = 0;
  let combo = 1;
  let missTotal = 0;
  let best = Infinity;
  let prompt: TracePrompt | null = null;
  let phase: 'idle' | 'listen' | 'ready' | 'playing' | 'shown' = 'idle';
  /** performance.now() when the prompt, or the playing back of it, began: its first beat as heard. */
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

    // A line for each beat, a little brighter on each bar.
    if (contour.beat) {
      for (let k = 1; k * contour.beat < duration - 1e-6; k++) {
        const x = Math.round(tx(k * contour.beat)) + 0.5;
        g.strokeStyle = theme.fretBold;
        g.globalAlpha = k % BAR === 0 ? 0.8 : 0.35;
        g.beginPath();
        g.moveTo(x, top + padT - 4);
        g.lineTo(x, top + height - padB);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

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

    const nowMs = performance.now();

    // What was played, once it is over.
    if (shown && samples.length) {
      g.strokeStyle = theme.cyan;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx(0), cy(samples[0].cents));
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
      const counting = phase === 'listen' && nowMs < listenSince;
      const words =
        phase === 'playing' ? 'PLAY' : counting ? 'COUNT IN' : phase === 'listen' ? 'LISTEN' : metro.running ? 'YOUR TURN: HOLD THE NOTE ON A BEAT' : 'YOUR TURN: HOLD THE NOTE';
      g.fillText(words, left + padL, top + 12);
    }

    // The beat, as a light that flashes on each one and counts the bar.
    if (metro.running && !shown) {
      const { index, at } = metro.nearest(nowMs);
      const since = nowMs - at;
      const lit = since >= 0 ? Math.max(0, 1 - since / (beatMs * 0.6)) : 0;
      const x = left + width - padR - 8;
      const y = top + 12;
      g.globalAlpha = 0.3 + 0.7 * lit;
      g.fillStyle = (((index % BAR) + BAR) % BAR) === 0 ? theme.orange : theme.cyan;
      g.beginPath();
      g.arc(x, y, 4 + 2 * lit, 0, 2 * Math.PI);
      g.fill();
      g.globalAlpha = 1;
      g.font = `600 11px Orbitron, sans-serif`;
      g.textAlign = 'right';
      g.fillStyle = theme.muted;
      g.fillText(String((((index % BAR) + BAR) % BAR) + 1), x - 10, y);
    }

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

  /** Play the prompt: with the beat on, after a bar's count-in, and the beat runs on for the player. */
  function listen(): void {
    if (!prompt || phase === 'shown') return;
    cancel();
    cutPrompt?.();
    let at = now() + 0.05;
    if (metro.on) {
      const zero = now() + 0.1;
      metro.start(bpm, zero);
      at = zero + (BAR * 60) / bpm;
    }
    cutPrompt = playContour(prompt.from, prompt.contour, at);
    listenSince = heardAt(at);
    phase = 'listen';
    const mine = prompt;
    frame.later(listenSince - performance.now() + contourDuration(prompt.contour) * 1000 + 120, () => {
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
    const at = now() + 0.05;
    cutPrompt = playContour(prompt.from, line === 'target' ? prompt.contour : playedContour(), at);
    review = { line, since: heardAt(at) };
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
    if (asked >= game.prompts) return finish();
    cutPrompt?.();
    metro.stop();
    fx.clear();
    shown = null;
    review = null;
    prompt = null;
    phase = 'idle';
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt(...waiting(`${asked + 1} / ${game.prompts}`));
    frame.beat(() => void present());
  }

  async function present(): Promise<void> {
    samples = [];
    offsetY = 0;
    cents = 0;
    prompt = game.makePrompt(asked, tuning, frame.frets);
    // For tools/devkit.js, which plays a prompt back to check the scoring.
    if (import.meta.env.DEV) (window as unknown as { __prompt?: TracePrompt }).__prompt = prompt;
    const caption = game.caption?.(asked) ?? null;
    asked++;
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    promptLine = [
      el('span.caps', {}, caption ? `${asked} / ${game.prompts} · ${caption}` : `${asked} / ${game.prompts}`),
      el('b.call.pop', {}, `Trace ${contourWords(prompt.contour)}`),
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
    // With the beat running, the bend starts on the beat nearest the touch.
    playSince = metro.running ? metro.nearest(touch.time).at : touch.time;
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
    // Pushed a moment before the beat: that is the start of the bend.
    const t = Math.max(0, (touch.time - playSince) / 1000);
    if (t === 0) samples[0] = { t: 0, cents };
    else samples.push({ t, cents });
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
    if (seconds < contourDuration(prompt.contour)) samples.push({ t: Math.max(0, seconds), cents: 0 });
    settle();
  }

  function settle(): void {
    if (!prompt) return;
    voice.release();
    metro.stop();
    const mean = traceError(prompt.contour, samples);
    const grade = gradeTrace(mean);
    const scored = scoreGrade(grade, combo);
    score += scored.points;
    combo = scored.combo;
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
    bendStreak(frame, combo);
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
    if (phase === 'listen' || phase === 'playing' || review || metro.running) board.invalidate();
    // The prompt's time is up: the bend is over whether or not the finger has lifted.
    if (phase === 'playing' && prompt && (nowMs - playSince) / 1000 >= contourDuration(prompt.contour)) settle();
  });

  function finish(): void {
    prompt = null;
    metro.stop();
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt();
    const mean = missTotal / game.prompts;
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

  bendStreak(frame, 1);
  frame.setPrompt(el('span.caps', {}, game.subtitle));
  readyPanel(
    frame,
    `${mode.title} · ${game.subtitle}`,
    game.lines,
    () => {
      blip();
      next();
    },
    panelOption(
      'Beat',
      segmented<BeatStyle>(
        BEAT_STYLES.map((style) => ({ value: style, label: BEAT_WORDS[style] })),
        getSave().beat,
        (beat) => {
          updateSave((s) => ({ ...s, beat }));
          metro.stop();
          metro = new Metronome(beat);
          // A bar of it, to hear what was picked.
          unlock();
          metro.start(bpm, now() + 0.05);
          frame.later(BAR * beatMs - 50, () => {
            if (phase === 'idle') metro.stop();
          });
        },
      ),
    ),
  );

  return () => {
    cutPrompt?.();
    metro.stop();
    voice.stop();
    frame.teardown();
  };
}

const BEAT_WORDS: Record<BeatStyle, string> = { off: 'Off', click: 'Click', kit: 'Drums' };
