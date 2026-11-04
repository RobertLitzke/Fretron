// Scale Run: a scale shape is drawn on the neck, and the player taps it up to
// the octave and back down in time with the beat, one note a beat. Three
// rounds, each faster and in another position of the same key. A tap is graded
// by how far from its beat it landed; a wrong note, or a note not played, is
// off. Points are on the usual scale, and stars go by the average miss.

import { blip, pluck, thud, unlock, now } from '../../audio/audio';
import { BAR, Metronome } from '../../audio/beat';
import type { BoardTouch } from '../../board/board';
import type { LineData, NoteRenderData } from '../../board/renderer';
import type { Grade } from '../../core/bend';
import { modeById, scaleRunTargets, starsScaleRun } from '../../core/modes';
import { cellMidi, sameCell, pcName, type Cell } from '../../core/music';
import { Rng } from '../../core/rng';
import { asBuilderScale, builderScale, BUILDER_SCALES } from '../../core/scaleBuilder';
import { gradeTap, makeRunRound, MISS_MS, MISSED_TAP_MS, ROUND_BPM, ROUNDS, runTaps, scoreTap, TAP_WORDS, type RunRound } from '../../core/scaleRun';
import { formatMultiplier, NO_STREAK, topMultiplier, type Streak } from '../../core/streak';
import type { BeatStyle } from '../../core/storage';
import { el } from '../dom';
import { makeFrame, panelOption, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { getSave, keep, updateSave } from '../store';
import { runSeed, segmented } from '../ui';

/** The pause after a round's last note before the next round is counted in. */
const REST_MS = 1400;
/** A beat is the groove here, so there is no "off". */
const BEAT_WORDS: Record<Exclude<BeatStyle, 'off'>, string> = { click: 'Click', kit: 'Drums' };

type Phase = 'idle' | 'count' | 'play' | 'rest' | 'done';

export const scaleRunView: View = (root, ctx) => {
  const scaleId = asBuilderScale(ctx.params.scale);
  const scale = builderScale(scaleId);
  const mode = modeById(`scalerun-${scaleId}`)!;
  keep('scalerun', scaleId);
  const rng = new Rng(runSeed(ctx));
  const beatStyle = (): Exclude<BeatStyle, 'off'> => (getSave().beat === 'click' ? 'click' : 'kit');
  let metro = new Metronome(beatStyle());

  const frame = makeFrame(root, ctx, mode.title, { onDown });
  const { board, tuning, frets } = frame;
  const theme = board.theme;
  board.panLocked = true;

  const root_ = rng.int(12);
  const taps = runTaps(scale.steps.length);
  let round = -1;
  let r: RunRound | null = null;
  let phase: Phase = 'idle';
  /** On the page's clock (ms), when the round's first note is due; each later one a beat on. */
  let zero = 0;
  let beatMs = 0;
  /** What each note of the round got: a grade, or nothing yet. */
  let got: (Grade | null)[] = [];
  let points = 0;
  let streak: Streak = NO_STREAK;
  /** Over the whole run. */
  let onBeat = 0;
  let wrong = 0;
  let missed = 0;
  let missSum = 0;
  let played = 0;
  let damp: () => void = () => undefined;

  const showStreak = () => frame.setStreak(streak.run, formatMultiplier(streak.mult), taps);
  showStreak();

  /** When note `k` of the round is due, on the page's clock. */
  const due = (k: number) => zero + k * beatMs;

  function paint(nowMs = performance.now()): void {
    if (!r) {
      board.setNotes([]);
      board.setLines([]);
      return;
    }
    // The note due now (or next), and the one after it: lit, and half lit.
    const next = phase === 'play' || phase === 'count' ? got.findIndex((g) => g === null) : -1;
    const soon = next >= 0 && nowMs >= due(next) - beatMs;
    const notes: NoteRenderData[] = r.cells.map((cell, i) => {
      const isRoot = i === 0 || i === r!.cells.length - 1;
      const color = isRoot ? theme.pivot : theme.cyan;
      const current = next >= 0 && r!.order[next] === i;
      const following = next >= 0 && next + 1 < r!.order.length && r!.order[next + 1] === i;
      return {
        fret: cell.fret,
        stringIndex: cell.string,
        displayLabel: r!.names[i],
        fillColor: current && soon ? theme.orange : 'transparent',
        strokeColor: current ? theme.orange : following ? theme.orange : color,
        strokeWidth: current ? 3 : 1.5,
        labelColor: current && soon ? undefined : current || following ? theme.orange : color,
        opacity: current ? 1 : following ? 0.85 : 0.7,
        dashed: following && !current,
        radiusScale: current ? 1.15 : 0.9,
        glow: current && soon ? theme.orange : undefined,
      };
    });
    const lines: LineData[] = [];
    for (let i = 0; i + 1 < r.cells.length; i++) lines.push({ from: r.cells[i], to: r.cells[i + 1], color: theme.cyan, strokeWidth: 1.5, opacity: 0.3, dashed: true });
    board.setLines(lines);
    board.setNotes(notes);
  }

  function promptLine(...children: Parameters<typeof frame.setPrompt>): void {
    frame.setPrompt(el('span.caps', {}, `Round ${Math.min(round + 1, ROUNDS)} / ${ROUNDS}`), ...children);
  }

  /** Count the next round in: a bar of the beat, then the first note is due on the next downbeat. */
  function startRound(): void {
    round++;
    if (round >= ROUNDS) return finish();
    const bpm = ROUND_BPM[round];
    r = makeRunRound(rng, tuning, scaleId, root_, frets, bpm, r ? r.cells[0] : null);
    got = r.order.map(() => null);
    beatMs = 60000 / bpm;
    const at = now() + 0.1 + (BAR * 60) / bpm;
    metro.start(bpm, at, BAR);
    zero = metro.heard(0);
    phase = 'count';
    board.show(r.cells);
    promptLine(el('b.call.pop', {}, `${pcName(root_, r.names[0].includes('♭') ? 'flat' : 'sharp')} ${scale.name}`), el('span.call-sub', {}, `${bpm} bpm`));
    paint();
  }

  /** Grade note `k` of the round and show it. */
  function land(k: number, grade: Grade, errorMs: number, at: Cell): void {
    got[k] = grade;
    const scored = scoreTap(grade, streak, taps);
    points += scored.points;
    streak = scored.streak;
    frame.setScore(points);
    showStreak();
    played++;
    if (grade === 'off') missSum += MISSED_TAP_MS;
    else {
      missSum += Math.abs(errorMs);
      if (grade === 'bullseye') onBeat++;
    }
    if (scored.points) frame.pop(`+${scored.points.toLocaleString('en-US')}`, [at], grade === 'bullseye' ? 'gold' : 'good');
    const word = grade === 'off' ? TAP_WORDS.off : errorMs < -TAP_BANDS_SHOWN && grade !== 'bullseye' ? `${TAP_WORDS[grade]} · early` : errorMs > TAP_BANDS_SHOWN && grade !== 'bullseye' ? `${TAP_WORDS[grade]} · late` : TAP_WORDS[grade];
    frame.banner(word, grade === 'off' ? 'bad' : 'good');
  }

  function onDown(touch: BoardTouch): void {
    if (!r || !touch.cell) return;
    if (phase !== 'play' && phase !== 'count') return;
    // Any note sounds; only the one that is due is graded.
    damp();
    damp = pluck(cellMidi(tuning, touch.cell), { level: 0.5 });
    // The nearest note still unplayed within half a beat of the tap.
    let k = -1;
    let best = beatMs / 2;
    for (let i = 0; i < got.length; i++) {
      if (got[i] !== null) continue;
      const off = Math.abs(touch.time - due(i));
      if (off <= best) {
        best = off;
        k = i;
      }
    }
    if (k < 0) {
      thud();
      return;
    }
    const want = r.cells[r.order[k]];
    const errorMs = touch.time - due(k);
    if (sameCell(touch.cell, want)) {
      const grade = gradeTap(errorMs);
      board.flash(want, grade === 'off' ? theme.danger : theme.good);
      land(k, grade, errorMs, want);
    } else {
      wrong++;
      thud();
      board.flash(touch.cell, theme.danger);
      land(k, 'off', errorMs, touch.cell);
    }
    paint(touch.time);
  }

  frame.everyFrame((nowMs) => {
    if (!r) return;
    if (phase === 'count' && nowMs >= zero - beatMs) phase = 'play';
    if (phase === 'play') {
      // Notes whose beat has gone by unplayed are missed.
      for (let k = 0; k < got.length; k++) {
        if (got[k] === null && nowMs > due(k) + MISS_MS) {
          missed++;
          land(k, 'off', MISS_MS, r.cells[r.order[k]]);
        }
      }
      if (got.every((g) => g !== null)) {
        phase = 'rest';
        metro.stop();
        frame.setPrompt(...waiting(round + 1 < ROUNDS ? `Round ${round + 2} / ${ROUNDS}` : 'Done'));
        frame.later(REST_MS, startRound);
      }
    }
    if (phase === 'play' || phase === 'count') paint(nowMs);
  });

  function finish(): void {
    phase = 'done';
    metro.stop();
    damp();
    frame.setPrompt();
    board.setNotes([]);
    board.setLines([]);
    const mean = played ? missSum / played : MISSED_TAP_MS;
    showResult(
      frame,
      ctx,
      {
        mode,
        value: points,
        stars: starsScaleRun(mean),
        targets: scaleRunTargets(),
        stats: [
          ['On the beat', `${onBeat} / ${taps}`],
          ['Average miss', `${Math.round(mean)} ms`],
          ['Wrong notes', String(wrong)],
          ['Not played', String(missed)],
          ['Top tempo', `${ROUND_BPM[ROUNDS - 1]} bpm`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.setScore(0);
  frame.setPrompt(el('span.caps', {}, scale.name));
  readyPanel(
    frame,
    `${mode.title} · ${scale.name}`,
    [
      'The shape is drawn. Tap it up to the octave and back, one note a beat, after a bar counted in.',
      `${ROUNDS} rounds, ${ROUND_BPM.join(', ')} bpm, each in a new position. Points for landing on the beat; the multiplier tops out at ${formatMultiplier(topMultiplier(taps))}.`,
    ],
    scaleRunTargets(),
    () => {
      blip();
      startRound();
    },
    el(
      'div',
      {},
      panelOption(
        'Scale',
        el(
          'select.pick',
          { onchange: (e: Event) => ctx.replace(`/play/scalerun/${(e.target as HTMLSelectElement).value}`) },
          BUILDER_SCALES.map((s) => el('option', { value: s.id, selected: s.id === scaleId }, s.name)),
        ),
      ),
      panelOption(
        'Beat',
        segmented<Exclude<BeatStyle, 'off'>>(
          (['click', 'kit'] as const).map((style) => ({ value: style, label: BEAT_WORDS[style] })),
          beatStyle(),
          (beat) => {
            updateSave((s) => ({ ...s, beat }));
            metro.stop();
            metro = new Metronome(beat);
            unlock();
            metro.start(ROUND_BPM[0], now() + 0.05);
            frame.later((BAR * 60000) / ROUND_BPM[0] - 50, () => {
              if (phase === 'idle') metro.stop();
            });
          },
        ),
      ),
    ),
  );

  if (import.meta.env.DEV) (window as unknown as { __scaleRun?: unknown }).__scaleRun = { due: (k: number) => due(k), cells: () => r?.cells, order: () => r?.order, phase: () => phase };

  return () => {
    metro.stop();
    damp();
    frame.teardown();
  };
};

/** Past this many milliseconds the banner says which way the tap was off. */
const TAP_BANDS_SHOWN = 50;
