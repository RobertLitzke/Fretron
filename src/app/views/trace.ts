// Bend Trace: hear a bend that moves over time (a half step, then a whole step,
// say) and watch its line, then play it back. The line goes away as you start;
// only the clock runs across the graph. Judged on how far your pitch was from
// the prompt's across its whole length. It plays to a beat, and the songs
// (song.ts) play their phrases through the same game.
//
// The touch and the scoring are shared with the other bending games
// (game/bendInput.ts).

import { blip, heardAt, now, playContour, unlock } from '../../audio/audio';
import { BAR, COUNT_IN, inBar, Metronome } from '../../audio/beat';
import type { BoardTouch } from '../../board/board';
import {
  BEND_PROMPTS,
  bendLabel,
  contourAt,
  contourDuration,
  contourPeak,
  contourWords,
  gradeTrace,
  makeTracePrompt,
  traceError,
  TRACE_BPM,
  type Contour,
  type Grade,
  type TracePrompt,
  type TraceSample,
} from '../../core/bend';
import type { BoardLayout } from '../../core/geometry';
import { asTier, bendTargets, modeById, starsTrace, tierWords, type Mode, type Targets } from '../../core/modes';
import { pc, pcName, stringName, type Tuning } from '../../core/music';
import { Rng } from '../../core/rng';
import { BEAT_STYLES, type BeatStyle } from '../../core/storage';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { BendInput, BendScore, gradeColor, onPuck, paintPuck, reviewButtons, SLIP_CENTS, SLIP_MS, STREAK_LINE } from '../game/bendInput';
import { makeFrame, panelOption, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View, ViewContext } from '../router';
import { getSave, updateSave } from '../store';
import { freshSeed, segmented } from '../ui';

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
  /** What each star takes, on the ready panel and the result. */
  targets: Targets;
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
    targets: bendTargets(true),
    lines: [
      'Hear a bend in time and see its shape, then play it back from memory on the lit note, on the beat.',
      `${BEND_PROMPTS} bends, scored on pitch along the way. Another finger calls one off.`,
      STREAK_LINE,
    ],
  });
};

export function traceGame(root: HTMLElement, ctx: ViewContext, game: TraceGame): () => void {
  const { mode, bpm } = game;
  const fx = new BendFx();
  let metro = new Metronome(getSave().beat);
  const beatMs = 60_000 / bpm;

  let asked = 0;
  let missTotal = 0;
  let best = Infinity;
  let prompt: TracePrompt | null = null;
  let phase: 'idle' | 'listen' | 'ready' | 'playing' | 'shown' = 'idle';
  /** performance.now() when the prompt, or the playing back of it, began: its first beat as heard. */
  let listenSince = 0;
  let playSince = 0;
  /** With the beat on, the beat the player is counted in to, and when it is heard (page ms). */
  let turn: { index: number; at: number } | null = null;
  let cutPrompt: (() => void) | null = null;
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

  const input = new BendInput({
    semitonePx,
    paint: (held) => {
      if (prompt) paintPuck(frame, prompt.cell, name(prompt.from), input.offsetY, held);
    },
  });
  const tally = new BendScore(frame, fx, game.prompts);

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
      const turnIn = turn && phase === 'ready' ? turn.at - nowMs : -1;
      const words =
        phase === 'playing'
          ? 'PLAY'
          : counting
            ? 'COUNT IN'
            : phase === 'listen'
              ? 'LISTEN'
              : turnIn > COUNT_IN * beatMs
                ? 'YOUR TURN: HOLD THE NOTE'
                : turnIn > 0
                  ? 'YOUR TURN: COUNT IN'
                  : metro.running
                    ? 'YOUR TURN: HOLD THE NOTE ON A BEAT'
                    : 'YOUR TURN: HOLD THE NOTE';
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
      g.fillStyle = inBar(index) === 0 ? theme.orange : theme.cyan;
      g.beginPath();
      g.arc(x, y, 4 + 2 * lit, 0, 2 * Math.PI);
      g.fill();
      g.globalAlpha = 1;
      g.font = `600 11px Orbitron, sans-serif`;
      g.textAlign = 'right';
      g.fillStyle = theme.muted;
      g.fillText(String(inBar(index) + 1), x - 10, y);
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

  /**
   * Play the prompt. With the beat on, it is counted in, and the beat runs on
   * under it and after it: the player is counted in to the first bar after it.
   */
  function listen(): void {
    if (!prompt || phase === 'shown') return;
    cancel();
    cutPrompt?.();
    turn = null;
    let at = now() + 0.05;
    if (metro.on) {
      at = now() + 0.1 + (COUNT_IN * 60) / bpm;
      metro.start(bpm, at, COUNT_IN);
      // Rounded to the beat it ends on: a contour is timed to the millisecond.
      countInTurn(Math.ceil(contourDuration(prompt.contour) / (60 / bpm) - 0.01));
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

  /** Count the player in to the first bar line with room for a count-in from beat `from`. */
  function countInTurn(from: number): void {
    const index = Math.ceil((from + COUNT_IN) / BAR) * BAR;
    metro.countInto(index);
    turn = { index, at: metro.heard(index) };
  }

  /** A fresh count-in to the player's turn, if the beat is running: after a cancel, or a slip. */
  function recount(): void {
    if (metro.running) countInTurn(metro.nearest(performance.now()).index + 1);
  }

  /** Mute the bend being played and put the note back, unscored, to be tried again. */
  function cancel(): void {
    if (phase !== 'playing' || !prompt) return;
    phase = 'ready';
    samples = [];
    input.drop();
    recount();
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
    turn = null;
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
    input.reset();
    prompt = game.makePrompt(asked, tuning, frame.frets);
    // For tools/devkit.js, which plays a prompt back to check the scoring.
    if (import.meta.env.DEV) (window as unknown as { __prompt?: TracePrompt }).__prompt = prompt;
    const caption = game.caption?.(asked) ?? null;
    asked++;
    paintPuck(frame, prompt.cell, name(prompt.from), 0, false);
    const where = `fret ${prompt.cell.fret}, ${stringName(tuning, prompt.cell.string)} string`;
    promptLine = [
      el('span.caps', {}, `${asked} / ${game.prompts}`),
      el('b.call.pop', {}, `Trace ${contourWords(prompt.contour)}`),
      el('span.call-sub', {}, caption ? `${caption} · ${where}` : `from ${name(prompt.from)} · ${where}`),
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
      if (!input.holds(touch)) cancel();
      return;
    }
    // Over: the note plays back what was played, and the rest of the board moves on.
    if (phase === 'shown' && prompt && onPuck(frame, prompt.cell, touch)) return hearAgain('yours');
    if (frame.takeNext(true)) return;
    if ((phase !== 'listen' && phase !== 'ready') || !prompt || !onPuck(frame, prompt.cell, touch)) return;
    // Counted in, the bend starts on the beat it was counted in to: the note can be
    // held ahead of it. Missed that, or the prompt cut short, it starts on the beat
    // nearest the touch.
    const heard = listenSince + contourDuration(prompt.contour) * 1000;
    const onTurn = turn !== null && touch.time >= heard && touch.time < turn.at + beatMs / 2;
    cutPrompt?.();
    phase = 'playing';
    playSince = onTurn ? turn!.at : metro.running ? metro.nearest(touch.time).at : touch.time;
    samples = [{ t: 0, cents: 0 }];
    input.start(touch, prompt.from);
  }

  function onMove(touch: BoardTouch): void {
    if (phase !== 'playing' || !prompt || !input.move(touch)) return;
    const { cents } = input;
    // Pushed a moment before the beat: that is the start of the bend.
    const t = Math.max(0, (touch.time - playSince) / 1000);
    if (t === 0) samples[0] = { t: 0, cents };
    else samples.push({ t, cents });
  }

  function onUp(touch: BoardTouch): void {
    if (phase !== 'playing' || !input.holds(touch) || !prompt) return;
    // Timed from the beat the bend started on, which can be after the note was taken.
    const seconds = (touch.time - playSince) / 1000;
    if (input.peak < SLIP_CENTS && seconds * 1000 < SLIP_MS) {
      phase = 'ready';
      input.drop();
      recount();
      return;
    }
    // Letting go early leaves the rest of the prompt unplayed: an unbent string.
    if (seconds < contourDuration(prompt.contour)) samples.push({ t: Math.max(0, seconds), cents: 0 });
    settle();
  }

  function settle(): void {
    if (!prompt) return;
    metro.stop();
    const mean = traceError(prompt.contour, samples);
    const grade = gradeTrace(mean);
    input.letGo(grade, false);
    missTotal += mean;
    best = Math.min(best, mean);
    shown = { mean, grade };
    phase = 'shown';
    frame.setAction(null);
    frame.setPrompt(
      ...promptLine,
      reviewButtons(
        () => hearAgain('target'),
        () => hearAgain('yours'),
      ),
    );
    tally.land(grade, [prompt.cell]);
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
        value: tally.points,
        stars: starsTrace(mean),
        targets: game.targets,
        stats: [
          ['Pitch accuracy', `${mean.toFixed(1)} ¢ off`],
          ['Best trace', `${best.toFixed(1)} ¢ off`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.setPrompt(el('span.caps', {}, game.subtitle));
  readyPanel(
    frame,
    `${mode.title} · ${game.subtitle}`,
    game.lines,
    game.targets,
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
    input.stop();
    frame.teardown();
  };
}

const BEAT_WORDS: Record<BeatStyle, string> = { off: 'Off', click: 'Click', kit: 'Drums' };
