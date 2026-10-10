// Scale Bends: Bend by Ear inside a scale, chosen before the run. The shape
// around the bend is drawn as hollow notes, the root picked out and named, and
// the note to bend up to is filled in where it is fretted: tap it to hear the
// target. Then bend up to it by ear, as in Bend by Ear, and let go.

import { BendVoice, blip, pluck } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { NoteRenderData } from '../../board/renderer';
import { BEND_PROMPTS, bendLabel, centsFromDrag, dragForCents, GRADE_WORDS, gradeBend, scoreGrade, type Grade } from '../../core/bend';
import { modeById, rankBend, scaleWords } from '../../core/modes';
import { cellMidi, pc, pcName, sameCell, stringName, type Cell } from '../../core/music';
import { Rng } from '../../core/rng';
import { asScale, degreeOf, makeScaleBendPrompt, SCALE_IDS, SCALES, scaleCells, type ScaleBendPrompt, type ScaleId } from '../../core/scaleBend';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { makeFrame, panelOption, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { updateSave } from '../store';
import { freshSeed, segmented } from '../ui';
import { gradeColor, onPuck, reviewButtons, signedCents } from './bend';

const SLIP_MS = 300;
const SLIP_CENTS = 8;

/** How many frets of the scale are drawn either side of the bend: about one position. */
const SHAPE_REACH = 4;

export const scaleBendView: View = (root, ctx) => {
  const scaleId = asScale(ctx.params.scale);
  const scale = SCALES[scaleId];
  const mode = modeById(`scalebend-${scaleId}`)!;
  // The menu's Play button comes back to the scale last played.
  updateSave((s) => ({ ...s, picks: { ...s.picks, scalebend: scaleId } }));
  const rng = new Rng(freshSeed());
  const voice = new BendVoice();
  const fx = new BendFx();

  let asked = 0;
  let score = 0;
  let combo = 1;
  let missTotal = 0;
  let secondsTotal = 0;
  let prompt: ScaleBendPrompt | null = null;
  let shape: Cell[] = [];
  let phase: 'idle' | 'aim' | 'bending' | 'shown' = 'idle';
  let aimSince = 0;
  let finger = -1;
  let downAt = 0;
  let downY = 0;
  let offsetY = 0;
  let cents = 0;
  let shown: { direction: number; error: number; grade: Grade; cents: number } | null = null;
  let promptLine: HTMLElement[] = [];

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const name = (midi: number) => pcName(pc(midi), 'sharp');
  const semitonePx = () => (prompt ? prompt.travel * board.layout.spacing : 1);

  /** The shape, the target and the note being bent, which is drawn last so it passes over the rest. */
  function paint(held: boolean): void {
    if (!prompt) return;
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
    const targetY = centre.y + shown.direction * dragForCents(prompt.semis * 100, semitonePx());
    const half = board.noteRadius * 2.1;
    g.save();
    g.strokeStyle = board.theme.orange;
    g.shadowColor = board.theme.orange;
    g.shadowBlur = 10;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(centre.x - half, targetY);
    g.lineTo(centre.x + half, targetY);
    g.stroke();
    g.shadowBlur = 0;
    g.font = `700 26px Orbitron, sans-serif`;
    g.fillStyle = gradeColor(frame, shown.grade);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(signedCents(shown.error), centre.x - half - 10 + fx.shake(), centre.y + offsetY);
    g.restore();
    fx.draw(g, centre.x, centre.y + offsetY, board.noteRadius * 1.15, gradeColor(frame, shown.grade));
  };
  frame.everyFrame((nowMs) => {
    if (fx.tick(nowMs)) board.invalidate();
  });

  function hearTarget(): void {
    if (prompt) pluck(prompt.to, { level: 0.55, ring: 0.6 });
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
    offsetY = 0;
    cents = 0;
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
    // Over: the bent note plays back what was played, the target plays the target, and the rest of the board moves on.
    if (phase === 'shown' && prompt) {
      if (onPuck(frame, prompt.cell, touch, offsetY)) return hearYours();
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
    finger = touch.id;
    downAt = touch.time;
    downY = touch.y;
    offsetY = 0;
    cents = 0;
    voice.start(prompt.from);
    paint(true);
  }

  function onMove(touch: BoardTouch): void {
    if (phase !== 'bending' || touch.id !== finger || !prompt) return;
    const drag = touch.y - downY;
    cents = centsFromDrag(drag, semitonePx());
    offsetY = Math.sign(drag) * dragForCents(cents, semitonePx());
    voice.setCents(cents);
    paint(true);
  }

  function onUp(touch: BoardTouch): void {
    if (phase !== 'bending' || touch.id !== finger || !prompt) return;
    if (cents < SLIP_CENTS && touch.time - downAt < SLIP_MS) {
      voice.stop();
      phase = 'aim';
      offsetY = 0;
      paint(false);
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
    shown = { direction: offsetY < 0 ? -1 : 1, error, grade, cents };
    phase = 'shown';
    fx.burst(grade);
    frame.setAction(null);
    frame.setPrompt(...promptLine, reviewButtons(hearTarget, hearYours));
    frame.setScore(score);
    frame.setCombo(combo);
    frame.banner(scored.points ? `${GRADE_WORDS[grade]} · +${scored.points}` : GRADE_WORDS[grade], grade === 'off' ? 'bad' : 'good');
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

  frame.setCombo(1);
  frame.setPrompt(el('span.caps', {}, scaleWords(scaleId)));
  readyPanel(
    frame,
    `${mode.title} · ${scaleWords(scaleId)}`,
    [
      `Each bend is in a new key of the ${scale.name} scale. Its notes around the bend are drawn hollow, with the root named in gold.`,
      'The green note is the one to reach: tap it to hear it. Then hold the orange note and push it up until it matches.',
      'Afterwards, tap the orange note to hear where you let go, and the green one to hear the target.',
      `${BEND_PROMPTS} bends, scored as in Bend by Ear. Within 5 cents is a bullseye.`,
    ],
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
    voice.stop();
    frame.teardown();
  };
};
