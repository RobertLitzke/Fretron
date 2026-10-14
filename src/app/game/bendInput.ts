// What every bending game shares: pushing a note across the neck with one
// finger, and scoring and showing a bend once it is let go. Bend by Ear, Scale
// Bends, Scale Builder and Bend Trace each keep their own prompts and phases,
// and hand their touches here.
//
// A second finger anywhere on the board while a bend is held mutes it and
// calls it off: it is not scored, and the same bend is asked again. Each game
// decides what else a second finger does (Scale Bends plays the target with it).

import { BendVoice } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import { BEND_PROMPTS, centsFromDrag, dragForCents, GRADE_WORDS, scoreGrade, type Grade } from '../../core/bend';
import type { Cell } from '../../core/music';
import { formatMultiplier, GREEN_STEP, NO_STREAK, OK_STEP, type Streak } from '../../core/streak';
import { el } from '../dom';
import type { BendFx } from './bendFx';
import type { Frame } from './frame';

/** A touch shorter than this that barely moved is a slip, not a bend. */
export const SLIP_MS = 300;
export const SLIP_CENTS = 8;

/** How the streak works in the bend games, for their ready panels. */
export const STREAK_LINE = `Green bends add ×${GREEN_STEP} to the multiplier, tan ×${OK_STEP}; an off bend resets it.`;

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

/** The streak meter in the bend games: the bends in a row, and the multiplier they give. */
export function bendStreak(frame: Frame, streak: Streak, prompts = BEND_PROMPTS): void {
  frame.setStreak(streak.run, formatMultiplier(streak.mult), prompts - 1);
}

/** Where the note is on the board, pushed as far as it was bent. */
export function bentTo(frame: Frame, cell: Cell, offsetY: number): { x: number; y: number } {
  const { x, y } = frame.board.centre(cell);
  return { x, y: y + offsetY };
}

/** Draw the note being bent, alone on the board, pulled `offsetY` pixels across the neck, and its string with it. */
export function paintPuck(frame: Frame, cell: Cell, label: string, offsetY: number, held: boolean): void {
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

/**
 * After a bend to one pitch: a bar where the string had to be held for the
 * target, named if `label` is given, the miss in cents beside the note where it
 * was let go, and the burst round it.
 */
export function drawLanding(
  g: CanvasRenderingContext2D,
  frame: Frame,
  fx: BendFx,
  centre: { x: number; y: number },
  landed: { targetY: number; offsetY: number; error: number; grade: Grade; label?: string },
): void {
  const { board } = frame;
  const half = board.noteRadius * 2.1;
  g.save();
  g.strokeStyle = board.theme.orange;
  g.shadowColor = board.theme.orange;
  g.shadowBlur = 10;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(centre.x - half, landed.targetY);
  g.lineTo(centre.x + half, landed.targetY);
  g.stroke();
  g.shadowBlur = 0;
  g.textBaseline = 'middle';
  if (landed.label) {
    g.font = `600 12px Orbitron, sans-serif`;
    g.textAlign = 'left';
    g.fillStyle = board.theme.orange;
    g.fillText(landed.label, centre.x + half + 8, landed.targetY);
  }
  g.font = `700 26px Orbitron, sans-serif`;
  g.fillStyle = gradeColor(frame, landed.grade);
  g.textAlign = 'right';
  g.fillText(signedCents(landed.error), centre.x - half - 10 + fx.shake(), centre.y + landed.offsetY);
  g.restore();
  fx.draw(g, centre.x, centre.y + landed.offsetY, board.noteRadius * 1.15, gradeColor(frame, landed.grade));
}

/**
 * One finger pushing a note across the neck. Either way across raises the
 * pitch; a dip (Scale Builder's way down) lowers it instead. The game says
 * when a bend starts and how it ends; this keeps the touch, the pitch and the
 * sound in step, and redraws the note through `paint` as it moves.
 */
export class BendInput {
  readonly voice = new BendVoice();
  /** The touch holding the note, or -1. */
  finger = -1;
  /** When the note was taken hold of (touch time, page ms). */
  downAt = 0;
  /** How far the note is drawn from its place, in pixels across the neck. */
  offsetY = 0;
  /** The pitch now, in cents from the note: negative on a dip. */
  cents = 0;
  /** The furthest the pitch has gone from the note on this bend, in cents. */
  peak = 0;
  private downY = 0;
  private sign: 1 | -1 = 1;

  constructor(
    private readonly opts: {
      /** Pixels of push for a semitone, for the bend being played, on this screen. */
      semitonePx: () => number;
      /** Draw the note: held while the finger is down, `offsetY` from its place. */
      paint: (held: boolean) => void;
    },
  ) {}

  /** Whether this is the touch holding the note. */
  holds(touch: BoardTouch): boolean {
    return this.finger !== -1 && touch.id === this.finger;
  }

  /** Take hold of the note that sounds `midi` and start it ringing. */
  start(touch: BoardTouch, midi: number, direction: 'up' | 'down' = 'up'): void {
    this.finger = touch.id;
    this.downAt = touch.time;
    this.downY = touch.y;
    this.sign = direction === 'up' ? 1 : -1;
    this.offsetY = 0;
    this.cents = 0;
    this.peak = 0;
    this.voice.start(midi);
    this.opts.paint(true);
  }

  /** Follow the finger. False for any other touch. */
  move(touch: BoardTouch): boolean {
    if (!this.holds(touch)) return false;
    const drag = touch.y - this.downY;
    const px = this.opts.semitonePx();
    const amount = centsFromDrag(drag, px);
    this.cents = this.sign * amount;
    this.peak = Math.max(this.peak, amount);
    this.offsetY = Math.sign(drag) * dragForCents(amount, px);
    this.voice.setCents(this.cents);
    this.opts.paint(true);
    return true;
  }

  /** Whether a lift came too soon, on too little push, to be a bend. */
  slipped(touch: BoardTouch): boolean {
    return Math.abs(this.cents) < SLIP_CENTS && touch.time - this.downAt < SLIP_MS;
  }

  /** Mute the note and put it back in its place, as if it had not been touched: a slip, or a bend called off. */
  drop(): void {
    this.voice.stop();
    this.finger = -1;
    this.offsetY = 0;
    this.cents = 0;
    this.peak = 0;
    this.opts.paint(false);
  }

  /** The bend is over: let the note ring out, a bullseye's with a bloom. The note stays where it was let go. */
  letGo(grade: Grade, bloom = true): void {
    this.finger = -1;
    if (bloom && grade === 'bullseye') this.voice.bloom();
    else this.voice.release();
  }

  /** Put the note back in its place for the next bend. */
  reset(): void {
    this.offsetY = 0;
    this.cents = 0;
    this.peak = 0;
  }

  stop(): void {
    this.voice.stop();
  }
}

/** A run's points and streak in a bending game, and the show when a bend is scored. */
export class BendScore {
  points = 0;
  streak: Streak = NO_STREAK;

  /** `prompts`: the bends in a run, which weights each one's points so a run comes to the usual scale. */
  constructor(
    private readonly frame: Frame,
    private readonly fx: BendFx,
    private readonly prompts = BEND_PROMPTS,
  ) {
    bendStreak(frame, this.streak, prompts);
  }

  /** Score a bend and show it: the burst, the points floated up from `at`, the score, the streak and the grade's word. */
  land(grade: Grade, at: readonly Cell[] | { x: number; y: number }): void {
    const scored = scoreGrade(grade, this.streak, this.prompts);
    this.points += scored.points;
    this.streak = scored.streak;
    this.fx.burst(grade);
    this.frame.setScore(this.points);
    bendStreak(this.frame, this.streak, this.prompts);
    // An off bend wins nothing, and its broken streak says so.
    if (scored.points) this.frame.pop(`+${scored.points.toLocaleString('en-US')}`, at, grade === 'bullseye' ? 'gold' : 'good');
    this.frame.banner(GRADE_WORDS[grade], grade === 'off' ? 'bad' : 'good');
  }

  /** Back to ×1, outside a bend: Scale Builder's wrongly named step. */
  breakStreak(): void {
    this.streak = NO_STREAK;
    bendStreak(this.frame, this.streak, this.prompts);
  }
}
