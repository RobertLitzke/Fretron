// "Tap and rake": tap up to three frets to choose them, then drag a finger
// anywhere on the board to hand them in. The rake is only a way to say "this
// one": it need not cross the chosen strings, and other strings do not matter.

import { pluck } from '../../audio/audio';
import type { Board, BoardTouch } from '../../board/board';
import { cellMidi, sameCell, type Cell, type Tuning } from '../../core/music';

/** A finger that travels less than this, in pixels, is tapping. Further, it is raking. */
const TAP_SLOP = 14;

interface Stroke {
  x: number;
  y: number;
  cell: Cell | null;
  raking: boolean;
  handedIn: boolean;
}

export class TriadInput {
  /** The chosen frets, oldest first. Never two on one string, never more than three. */
  selected: Cell[] = [];
  /** While false, touches are ignored. */
  enabled = false;
  private readonly strokes = new Map<number, Stroke>();

  constructor(
    private readonly board: Board,
    private readonly tuning: Tuning,
    private readonly onChange: () => void,
    private readonly onRake: (cells: Cell[]) => void,
  ) {}

  clear(): void {
    this.selected = [];
    this.onChange();
  }

  down(touch: BoardTouch): void {
    if (!this.enabled) return;
    this.strokes.set(touch.id, {
      x: touch.x,
      y: touch.y,
      cell: touch.cell,
      raking: false,
      handedIn: false,
    });
  }

  move(touch: BoardTouch): void {
    const stroke = this.strokes.get(touch.id);
    if (!stroke || !this.enabled) return;
    if (!stroke.raking && Math.hypot(touch.x - stroke.x, touch.y - stroke.y) > TAP_SLOP) stroke.raking = true;
    if (!stroke.raking || stroke.handedIn || this.selected.length !== 3) return;
    stroke.handedIn = true;
    for (const cell of this.selected) this.board.flash(cell, this.board.theme.cyan);
    this.onRake(this.selected.slice());
  }

  up(touch: BoardTouch): void {
    const stroke = this.strokes.get(touch.id);
    this.strokes.delete(touch.id);
    if (!stroke || !this.enabled || stroke.raking || !stroke.cell) return;
    this.toggle(stroke.cell);
  }

  private toggle(cell: Cell): void {
    if (this.selected.some((c) => sameCell(c, cell))) {
      this.selected = this.selected.filter((c) => !sameCell(c, cell));
    } else {
      // One fret to a string; a fourth choice pushes one out.
      this.selected = this.selected.filter((c) => c.string !== cell.string);
      this.selected.push(cell);
      if (this.selected.length > 3) this.selected.splice(this.pushedOut(), 1);
      pluck(cellMidi(this.tuning, cell), { level: 0.35, ring: 0.3 });
    }
    this.onChange();
  }

  /**
   * Which of four chosen frets to drop, the newest last: the oldest of those
   * that leave the other three on neighbouring strings, or else the oldest.
   * Not simply the oldest, or which note goes would depend on the order they
   * were tapped in, and a stray note could stay while a good one went.
   */
  private pushedOut(): number {
    for (let i = 0; i < 3; i++) {
      const strings = this.selected.filter((_, j) => j !== i).map((c) => c.string).sort((a, b) => a - b);
      if (strings[1] === strings[0] + 1 && strings[2] === strings[1] + 1) return i;
    }
    return 0;
  }
}
