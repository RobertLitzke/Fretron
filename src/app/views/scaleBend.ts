// Scale Bends: Bend by Ear inside a scale, chosen before the run. The shape
// around the bend is drawn as hollow notes, the root picked out and named, and
// the note to bend up to is filled in where it is fretted: tap it to hear the
// target. Then bend up to it by ear, as in Bend by Ear, and let go.

import { blip, pluck } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { NoteRenderData } from '../../board/renderer';
import { BEND_PROMPTS, bendLabel, dragForCents, gradeBend, type Grade } from '../../core/bend';
import { bendTargets, modeById, starsBend, scaleWords } from '../../core/modes';
import { cellMidi, pc, pcName, sameCell, stringName, type Cell } from '../../core/music';
import { Rng } from '../../core/rng';
import { asScale, degreeOf, makeScaleBendPrompt, SCALE_IDS, SCALES, scaleCells, type ScaleBendPrompt, type ScaleId } from '../../core/scaleBend';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { BendInput, BendScore, bentTo, drawLanding, onPuck, reviewButtons, STREAK_LINE } from '../game/bendInput';
import { makeFrame, panelOption, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { updateSave } from '../store';
import { freshSeed, segmented } from '../ui';

/** How many frets of the scale are drawn either side of the bend: about one position. */
const SHAPE_REACH = 4;

export const scaleBendView: View = (root, ctx) => {
  const scaleId = asScale(ctx.params.scale);
  const scale = SCALES[scaleId];
  const mode = modeById(`scalebend-${scaleId}`)!;
  // The menu's Play button comes back to the scale last played.
  updateSave((s) => ({ ...s, picks: { ...s.picks, scalebend: scaleId } }));
  const rng = new Rng(freshSeed());
  const fx = new BendFx();

  let asked = 0;
  let missTotal = 0;
  let secondsTotal = 0;
  let prompt: ScaleBendPrompt | null = null;
  let shape: Cell[] = [];
  let phase: 'idle' | 'aim' | 'bending' | 'shown' = 'idle';
  let aimSince = 0;
  let shown: { direction: number; error: number; grade: Grade; cents: number } | null = null;
  let promptLine: HTMLElement[] = [];

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');
  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);
  const input = new BendInput({ semitonePx, paint });
  const tally = new BendScore(frame, fx);

  /** The shape, the target and the note being bent, which is drawn last so it passes over the rest. */
  function paint(held: boolean): void {
    if (!prompt) return;
    const { offsetY } = input;
    const theme = board.theme;
    const p = prompt;
    const notes: NoteRenderData[] = [];
    for (const cell of shape) {
      if (sameCell(cell, p.cell) || sameCell(cell, p.target)) continue;
      // Only the root is named; the rest of the shape is there to be seen, not read.
      const isRoot = degreeOf(scale, p.root, cellMidi(tuning, cell)) === 'R';
      const color = isRoot ? theme.pivot : theme.cyan;
      notes.push({
        fret: cell.fret,
        stringIndex: cell.string,
        displayLabel: isRoot ? pcName(p.root, 'sharp') : undefined,
        fillColor: 'transparent',
        strokeColor: color,
        strokeWidth: isRoot ? 3 : 1.5,
        labelColor: color,
        opacity: isRoot ? 1 : 0.7,
        radiusScale: 0.85,
      });
    }
    notes.push({
      fret: p.target.fret,
      stringIndex: p.target.string,
      displayLabel: name(p.to),
      fillColor: theme.good,
      glow: theme.good,
      outerRing: degreeOf(scale, p.root, p.to) === 'R',
    });
    notes.push({
      fret: p.cell.fret,
      stringIndex: p.cell.string,
      displayLabel: name(p.from),
      fillColor: held ? theme.cyan : theme.orange,
      glow: held ? theme.cyan : theme.orange,
      radiusScale: 1.15,
      offsetY,
      outerRing: degreeOf(scale, p.root, p.from) === 'R',
    });
    board.setDeflection(offsetY ? { cell: p.cell, offsetY } : null);
    board.setNotes(notes);
  }

  board.overlay = (g, layout, start) => {
    if (!prompt || !shown) return;
    const centre = layout.center(prompt.cell, start);
    drawLanding(g, frame, fx, centre, {
      targetY: centre.y + shown.direction * dragForCents(prompt.semis * 100, semitonePx()),
      offsetY: input.offsetY,
      error: shown.error,
      grade: shown.grade,
    });
  };
  frame.everyFrame((nowMs) => {
    if (fx.tick(nowMs)) board.invalidate();
  });

  function hearTarget(): void {
    if (phase === 'bending') cancel();
    if (prompt) pluck(prompt.to, { level: 0.55, ring: 0.6 });
  }

  /** Mute the bend being held and put the note back, unscored, to be tried again. */
  function cancel(): void {
    if (phase !== 'bending' || !prompt) return;
    phase = 'aim';
    input.drop();
    frame.banner('Bend cancelled');
  }

  /** The note where it was let go, struck the same way as the target. */
  function hearYours(): void {
    if (prompt && shown) pluck(prompt.from + shown.cents / 100, { level: 0.55, ring: 0.6 });
  }

  function next(): void {
    if (asked >= BEND_PROMPTS) return finish();
    fx.clear();
    shown = null;
    prompt = null;
    shape = [];
    phase = 'idle';
    board.setNotes([]);
    board.setDeflection(null);
    frame.setPrompt(...waiting(`${asked + 1} / ${BEND_PROMPTS}`));
    frame.beat(() => void present());
  }

  async function present(): Promise<void> {
    input.reset();
    prompt = makeScaleBendPrompt(rng, tuning, scaleId, frame.frets);
    if (import.meta.env.DEV) (window as unknown as { __prompt?: ScaleBendPrompt }).__prompt = prompt;
    asked++;
    const p = prompt;
    shape = scaleCells(tuning, scale, p.root, p.cell.fret - SHAPE_REACH, Math.min(frame.frets, p.cell.fret + SHAPE_REACH));
    paint(false);
    const fromDegree = degreeOf(scale, p.root, p.from);
    const toDegree = degreeOf(scale, p.root, p.to);
    promptLine = [
      el('span.caps', {}, `${asked} / ${BEND_PROMPTS} · ${pcName(p.root, 'sharp')} ${scale.name}`),
      el('b.call.pop', {}, `Bend ${fromDegree} → ${toDegree} (${bendLabel(p.semis)})`),
      el('span.call-sub', {}, `${name(p.from)} → ${name(p.to)} · fret ${p.cell.fret}, ${stringName(tuning, p.cell.string)} string`),
    ];
    frame.setPrompt(...promptLine);
    board.show(shape.length ? shape : [p.cell, p.target]);
    await board.whenSettled();
    if (frame.gone) return;
    hearTarget();
    frame.setAction('Hear target', hearTarget);
    phase = 'aim';
    aimSince = performance.now();
  }

  function onDown(touch: BoardTouch): void {
    // A second finger while the bend is held calls it off; on the target, it plays it too.
    if (phase === 'bending') {
      if (input.holds(touch)) return;
      if (prompt && touch.cell && sameCell(touch.cell, prompt.target)) return hearTarget();
      return cancel();
    }
    // Over: the bent note plays back what was played, the target plays the target, and the rest of the board moves on.
    if (phase === 'shown' && prompt) {
      if (onPuck(frame, prompt.cell, touch, input.offsetY)) return hearYours();
      if (touch.cell && sameCell(touch.cell, prompt.target)) return hearTarget();
    }
    if (frame.takeNext(true)) return;
    if (phase !== 'aim' || !prompt) return;
    if (!onPuck(frame, prompt.cell, touch)) {
      // The target, and the rest of the shape, sound when tapped.
      if (touch.cell && sameCell(touch.cell, prompt.target)) hearTarget();
      else if (touch.cell && shape.some((c) => sameCell(c, touch.cell!))) pluck(cellMidi(tuning, touch.cell), { level: 0.4, ring: 0.4 });
      return;
    }
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
    shown = { direction: offsetY < 0 ? -1 : 1, error, grade, cents };
    phase = 'shown';
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearTarget, hearYours));
    tally.land(grade, bentTo(frame, prompt.cell, offsetY));
    board.invalidate();
    frame.offerNext(next);
  }

  function finish(): void {
    prompt = null;
    shape = [];
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

  frame.setPrompt(el('span.caps', {}, scaleWords(scaleId)));
  readyPanel(
    frame,
    `${mode.title} · ${scaleWords(scaleId)}`,
    [
      `A new key of the ${scale.name} scale each bend. Tap green to hear the target, then push orange up to match.`,
      `${BEND_PROMPTS} bends, scored as Bend by Ear. Another finger calls a bend off.`,
      STREAK_LINE,
    ],
    bendTargets(),
    () => {
      blip();
      next();
    },
    panelOption(
      'Scale',
      segmented<ScaleId>(
        SCALE_IDS.map((id) => ({ value: id, label: scaleWords(id) })),
        scaleId,
        (id) => {
          // Each scale is its own game, with its own score table: build it afresh.
          ctx.replace(modeById(`scalebend-${id}`)!.route);
        },
      ),
    ),
  );

  return () => {
    input.stop();
    frame.teardown();
  };
};
