// Scale Builder: a scale chosen before the run, a key picked by the game and
// its root played. Then the scale is built by ear from the root, one note at a
// time: hold the last note placed and push it until it sounds like the next,
// up to the octave as bends, and back down as dips. Nothing is played to match.
//
// Easy shows each note on the neck, named, and the step to it. Hard names the
// notes but hides where they are, and on the way up asks for each step (half,
// whole, or a step and a half) before it is played.

import { BendVoice, blip, pluck, thud } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { LineData, NoteRenderData } from '../../board/renderer';
import { bendLabel, centsFromDrag, dragForCents, GRADE_WORDS, gradeBend, scoreGrade, semitoneTravel, type Grade } from '../../core/bend';
import { levelWords, modeById, rankScaleBuild, scaleBuildTargets } from '../../core/modes';
import { sameCell } from '../../core/music';
import { Rng } from '../../core/rng';
import {
  asBuilderScale,
  asBuildLevel,
  BUILD_LEVELS,
  BUILDER_SCALES,
  builderScale,
  GAP_CHOICES,
  makeScaleRun,
  type BuildLevel,
  type Placement,
  type ScaleRun,
} from '../../core/scaleBuilder';
import { NO_STREAK } from '../../core/streak';
import { el } from '../dom';
import { BendFx } from '../game/bendFx';
import { makeFrame, panelOption, readyPanel } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { updateSave } from '../store';
import { freshSeed, segmented } from '../ui';
import { bendStreak, bentTo, gradeColor, onPuck, popGrade, reviewButtons, signedCents } from './bend';

const SLIP_MS = 300;
const SLIP_CENTS = 8;
const STEP_NAMES: Record<number, string> = { 1: 'Half step', 2: 'Whole step', 3: 'Step and a half' };

/** How long a placed note is shown before the next comes by itself. */
const AUTO_NEXT_MS = 1800;

export const scaleBuilderView: View = (root, ctx) => {
  const level = asBuildLevel(ctx.params.level);
  const scaleId = asBuilderScale(ctx.params.scale);
  const scale = builderScale(scaleId);
  const mode = modeById(`scales-${level}-${scaleId}`)!;
  const hard = level === 'hard';
  // The menu's Play button comes back to the scale and level last played.
  updateSave((s) => ({ ...s, picks: { ...s.picks, scales: `${level}-${scaleId}` } }));
  const rng = new Rng(freshSeed());
  const voice = new BendVoice();
  const fx = new BendFx();

  let run: ScaleRun | null = null;
  let at = 0;
  let score = 0;
  let streak = NO_STREAK;
  let misses: { direction: Placement['direction']; cents: number }[] = [];
  let wrongSteps = 0;
  /** The grade each note of the shape was last placed with; the root starts placed. */
  let placed = new Map<number, Grade | 'root'>();
  /** The steps shown on the neck: from note i to note i + 1. */
  let known = new Set<number>();
  let phase: 'idle' | 'name' | 'aim' | 'bending' | 'shown' = 'idle';
  let finger = -1;
  let downAt = 0;
  let downY = 0;
  let offsetY = 0;
  /** Signed: a bend raises the pitch, a dip lowers it. */
  let cents = 0;
  let shown: { error: number; grade: Grade; cents: number } | null = null;

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const current = (): Placement | null => run?.placements[at] ?? null;
  const semitonePx = () => (current()?.travel ?? 1) * board.layout.spacing;
  const sign = (p: Placement) => (p.direction === 'up' ? 1 : -1);

  // --- drawing ---------------------------------------------------------------

  function paint(held = false): void {
    if (!run) return;
    const theme = board.theme;
    const r = run;
    const p = current();
    const notes: NoteRenderData[] = [];
    r.cells.forEach((cell, i) => {
      if (p && i === p.from) return;
      const got = placed.get(i);
      const isRoot = i === 0 || i === r.cells.length - 1;
      const isTarget = p !== null && i === p.to;
      // On Hard, where a note is played stays hidden until the step to it is named.
      const seen = got !== undefined || !hard || (isTarget && known.has(Math.min(p.from, p.to)));
      if (!seen) return;
      // The root is a gold ring, apart from the gold of a tan note.
      if (got === 'root') {
        notes.push({ fret: cell.fret, stringIndex: cell.string, displayLabel: r.names[i], fillColor: 'transparent', strokeColor: theme.pivot, strokeWidth: 3, labelColor: theme.pivot, glow: isTarget ? theme.pivot : undefined, outerRing: isTarget });
        return;
      }
      if (got !== undefined) {
        const color = gradeColor(frame, got);
        notes.push({ fret: cell.fret, stringIndex: cell.string, displayLabel: r.names[i], fillColor: color, glow: isTarget ? color : undefined, outerRing: isTarget || isRoot });
        return;
      }
      const color = isRoot ? theme.pivot : theme.cyan;
      notes.push({
        fret: cell.fret,
        stringIndex: cell.string,
        displayLabel: r.names[i],
        fillColor: 'transparent',
        strokeColor: isTarget ? theme.orange : color,
        strokeWidth: isTarget ? 3 : 1.5,
        labelColor: isTarget ? theme.orange : color,
        opacity: isTarget ? 1 : 0.7,
        dashed: isTarget,
        radiusScale: 0.9,
      });
    });
    if (p) {
      const cell = r.cells[p.from];
      notes.push({
        fret: cell.fret,
        stringIndex: cell.string,
        displayLabel: r.names[p.from],
        fillColor: held ? theme.cyan : theme.orange,
        glow: held ? theme.cyan : theme.orange,
        radiusScale: 1.15,
        offsetY,
      });
      board.setDeflection(offsetY ? { cell, offsetY } : null);
    } else board.setDeflection(null);
    const lines: LineData[] = [];
    for (const i of known) lines.push({ from: r.cells[i], to: r.cells[i + 1], color: theme.cyan, strokeWidth: 1.5, opacity: 0.45, dashed: true });
    board.setLines(lines);
    board.setNotes(notes);
  }

  board.overlay = (g, layout, start) => {
    if (!run) return;
    const r = run;
    g.save();
    // Each step shown on the neck, named halfway along its line.
    g.font = `700 11px Orbitron, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const i of known) {
      const a = layout.center(r.cells[i], start);
      const b = layout.center(r.cells[i + 1], start);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const text = bendLabel(r.midis[i + 1] - r.midis[i]);
      const w = g.measureText(text).width + 10;
      g.fillStyle = board.theme.panel;
      g.globalAlpha = 0.85;
      g.fillRect(x - w / 2, y - 8, w, 16);
      g.globalAlpha = 1;
      g.fillStyle = board.theme.cyan;
      g.fillText(text, x, y);
    }
    const p = current();
    if (p && shown) {
      const centre = layout.center(r.cells[p.from], start);
      const direction = offsetY < 0 ? -1 : 1;
      const targetY = centre.y + direction * dragForCents(p.semis * 100, semitonePx());
      const half = board.noteRadius * 2.1;
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
      g.fillText(signedCents(shown.error), centre.x - half - 10 + fx.shake(), centre.y + offsetY);
      g.restore();
      fx.draw(g, centre.x, centre.y + offsetY, board.noteRadius * 1.15, gradeColor(frame, shown.grade));
      return;
    }
    g.restore();
  };
  frame.everyFrame((nowMs) => {
    if (fx.tick(nowMs)) board.invalidate();
  });

  /** The notes root to octave, with the steps between them, the next one lit. */
  function ladder(): HTMLElement {
    const r = run!;
    const p = current();
    const parts: HTMLElement[] = [];
    r.names.forEach((name, i) => {
      if (i > 0) parts.push(el('i', {}, known.has(i - 1) ? bendLabel(r.midis[i] - r.midis[i - 1]) : '?'));
      const now = p !== null && i === p.to;
      parts.push(el(`b${now ? '.now' : placed.has(i) ? '.done' : ''}`, {}, name));
    });
    return el('span.ladder', {}, parts);
  }

  function promptLine(...extra: HTMLElement[]): void {
    frame.setPrompt(ladder(), ...extra);
  }

  // --- sounds ----------------------------------------------------------------

  function hearRoot(): void {
    if (phase === 'bending') cancel();
    if (run) pluck(run.midis[0], { level: 0.55, ring: 0.6 });
  }

  function hearTarget(): void {
    const p = current();
    if (run && p) pluck(run.midis[p.to], { level: 0.55, ring: 0.6 });
  }

  function hearYours(): void {
    const p = current();
    if (run && p && shown) pluck(run.midis[p.from] + shown.cents / 100, { level: 0.55, ring: 0.6 });
  }

  /** Mute the push being held and put the note back, unscored, to be tried again. */
  function cancel(): void {
    if (phase !== 'bending') return;
    voice.stop();
    phase = 'aim';
    finger = -1;
    offsetY = 0;
    cents = 0;
    paint(false);
    frame.banner('Cancelled');
  }

  // --- the run ---------------------------------------------------------------

  async function begin(): Promise<void> {
    run = makeScaleRun(rng, tuning, scaleId, frame.frets, (cell) => semitoneTravel(rng, tuning, cell));
    if (import.meta.env.DEV) (window as unknown as { __scaleRun?: ScaleRun }).__scaleRun = run;
    at = 0;
    placed = new Map([[0, 'root']]);
    known = new Set(hard ? [] : run.cells.slice(1).map((_, i) => i));
    phase = 'idle';
    paint();
    promptLine();
    board.show(run.cells);
    await board.whenSettled();
    if (frame.gone) return;
    frame.banner(`${run.names[0]} ${scale.name}`);
    hearRoot();
    frame.later(700, present);
  }

  function present(): void {
    const p = current();
    if (!run || !p) return finish();
    fx.clear();
    shown = null;
    offsetY = 0;
    cents = 0;
    if (p.direction === 'down' && p.from === run.cells.length - 1) frame.banner('Now back down');
    frame.setAction('Hear root', hearRoot);
    if (hard && !known.has(Math.min(p.from, p.to))) {
      phase = 'name';
      paint();
      promptLine(
        el(
          'span.step-pick',
          {},
          GAP_CHOICES.map((semis) => el('button.btn.btn-small', { type: 'button', onclick: () => nameStep(semis) }, bendLabel(semis))),
        ),
      );
      return;
    }
    phase = 'aim';
    paint();
    promptLine(el('b.call.pop', {}, p.direction === 'up' ? 'Bend ▲' : 'Dip ▼'));
  }

  /** Hard: the step to the next note, named before it is played. */
  function nameStep(semis: number): void {
    const p = current();
    if (phase !== 'name' || !p) return;
    known.add(Math.min(p.from, p.to));
    if (semis === p.semis) {
      blip(1560, 0.06);
      frame.banner(STEP_NAMES[p.semis], 'good');
    } else {
      thud();
      wrongSteps++;
      streak = NO_STREAK;
      bendStreak(frame, streak, run!.placements.length);
      frame.banner(`It's a ${STEP_NAMES[p.semis].toLowerCase()}`, 'bad');
    }
    const cell = run!.cells[p.to];
    frame.pop(semis === p.semis ? 'Right step' : 'Wrong step', [cell], semis === p.semis ? 'good' : 'bad');
    phase = 'aim';
    present();
  }

  function onDown(touch: BoardTouch): void {
    const p = current();
    if (phase === 'bending') {
      if (touch.id !== finger) cancel();
      return;
    }
    if (phase === 'shown' && run && p) {
      if (onPuck(frame, run.cells[p.from], touch, offsetY)) return hearYours();
      if (touch.cell && sameCell(touch.cell, run.cells[p.to])) return hearTarget();
    }
    if (frame.takeNext(true)) return;
    if (!run || !p) return;
    if (phase !== 'aim' || !onPuck(frame, run.cells[p.from], touch)) {
      // Any note already placed sounds when tapped.
      const i = touch.cell ? run.cells.findIndex((c) => sameCell(c, touch.cell!)) : -1;
      if (i >= 0 && placed.has(i)) pluck(run.midis[i], { level: 0.4, ring: 0.45 });
      return;
    }
    phase = 'bending';
    finger = touch.id;
    downAt = touch.time;
    downY = touch.y;
    offsetY = 0;
    cents = 0;
    voice.start(run.midis[p.from]);
    paint(true);
  }

  function onMove(touch: BoardTouch): void {
    const p = current();
    if (phase !== 'bending' || touch.id !== finger || !p) return;
    const drag = touch.y - downY;
    const amount = centsFromDrag(drag, semitonePx());
    cents = sign(p) * amount;
    offsetY = Math.sign(drag) * dragForCents(amount, semitonePx());
    voice.setCents(cents);
    paint(true);
  }

  function onUp(touch: BoardTouch): void {
    const p = current();
    if (phase !== 'bending' || touch.id !== finger || !p || !run) return;
    if (Math.abs(cents) < SLIP_CENTS && touch.time - downAt < SLIP_MS) {
      voice.stop();
      phase = 'aim';
      offsetY = 0;
      paint(false);
      return;
    }
    const error = cents - sign(p) * p.semis * 100;
    const grade = gradeBend(error);
    const scored = scoreGrade(grade, streak, run.placements.length);
    if (grade === 'bullseye') voice.bloom();
    else voice.release();
    score += scored.points;
    streak = scored.streak;
    misses.push({ direction: p.direction, cents: Math.abs(error) });
    placed.set(p.to, grade);
    shown = { error, grade, cents };
    phase = 'shown';
    fx.burst(grade);
    frame.setScore(score);
    bendStreak(frame, streak, run.placements.length);
    popGrade(frame, grade, scored.points, bentTo(frame, run.cells[p.from], offsetY));
    frame.banner(GRADE_WORDS[grade], grade === 'off' ? 'bad' : 'good');
    paint(false);
    promptLine(reviewButtons(hearTarget, hearYours));
    board.invalidate();
    frame.offerNext(() => {
      at++;
      present();
    }, AUTO_NEXT_MS);
  }

  function finish(): void {
    const r = run;
    run = null;
    phase = 'idle';
    board.setNotes([]);
    board.setLines([]);
    board.setDeflection(null);
    frame.setAction(null);
    frame.setPrompt();
    if (!r) return;
    const mean = (list: typeof misses) => (list.length ? list.reduce((n, m) => n + m.cents, 0) / list.length : 0);
    const all = mean(misses);
    const stats: [string, string][] = [
      ['Pitch accuracy', `${all.toFixed(1)} ¢ off`],
      ['Going up', `${mean(misses.filter((m) => m.direction === 'up')).toFixed(1)} ¢ off`],
      ['Coming down', `${mean(misses.filter((m) => m.direction === 'down')).toFixed(1)} ¢ off`],
    ];
    if (hard) stats.push(['Steps named', `${scale.steps.length - wrongSteps} / ${scale.steps.length}`]);
    showResult(
      frame,
      ctx,
      { mode, value: score, rank: rankScaleBuild(all, wrongSteps), targets: scaleBuildTargets(), stats },
      () => ctx.replace(mode.route),
    );
  }

  bendStreak(frame, NO_STREAK, scale.steps.length * 2);
  frame.setPrompt(el('span.caps', {}, `${scale.name} · ${levelWords(level)}`));
  const go = (to: { level?: BuildLevel; scale?: string }) => ctx.replace(modeById(`scales-${to.level ?? level}-${to.scale ?? scaleId}`)!.route);
  readyPanel(
    frame,
    `${mode.title} · ${scale.name}`,
    [
      'The game picks a key and plays its root. Build the scale from it by ear, a note at a time, up to the octave and back down.',
      'Hold the orange note and push until it sounds like the next note: going up bends it sharp, coming down dips it flat. Nothing is played to match.',
      hard
        ? 'Hard: the notes are named but not shown. Going up, name each step (½, 1 or 1½ tones) before you play it; a wrong one costs a star and the streak.'
        : 'Easy: every note is on the neck, with the step to it on the line between.',
      'Tap a placed note to hear it again. Another finger mid-push calls it off.',
      `${scale.steps.length * 2} notes, scored like Bend by Ear, streak and all.`,
    ],
    scaleBuildTargets(),
    () => {
      blip();
      void begin();
    },
    el(
      'div',
      {},
      panelOption(
        'Level',
        segmented<BuildLevel>(
          BUILD_LEVELS.map((l) => ({ value: l, label: levelWords(l) })),
          level,
          (l) => go({ level: l }),
        ),
      ),
      panelOption(
        'Scale',
        el(
          'select.pick',
          { onchange: (e: Event) => go({ scale: (e.target as HTMLSelectElement).value }) },
          BUILDER_SCALES.map((s) => el('option', { value: s.id, selected: s.id === scaleId }, s.name)),
        ),
      ),
    ),
  );

  return () => {
    voice.stop();
    frame.teardown();
  };
};
