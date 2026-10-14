// The board as a thing on the page: the canvas, the sliding window onto the
// neck, the rail under it that moves the window, and touches turned into
// places on the neck.

import { unlock } from '../audio/audio';
import { BoardLayout, visibleFrets, type Hand } from '../core/geometry';
import { SHARP_NAMES, pc, type Cell, type Tuning } from '../core/music';
import { el } from '../app/dom';
import { Fretboard, readTheme, type BoardTheme, type Deflection, type LineData, type NoteRenderData } from './renderer';

/** A finger on the board. */
export interface BoardTouch {
  id: number;
  /** Canvas position in CSS pixels. */
  x: number;
  y: number;
  /** The cell under it, or null off the playable neck. */
  cell: Cell | null;
  /** Position between strings: 0 is the lowest string, 1.5 is midway between the next two. */
  string: number;
  /** Position along the neck in fret units. */
  pos: number;
  /** performance.now() of the event. */
  time: number;
}

export interface BoardOptions {
  hand: Hand;
  tuning: Tuning;
  /** How many frets the neck has. */
  frets: number;
  /** False leaves the open strings out of play: no names beside the nut, and a tap there touches no fret. */
  openStrings?: boolean;
  onDown?: (touch: BoardTouch) => void;
  onMove?: (touch: BoardTouch) => void;
  onUp?: (touch: BoardTouch) => void;
  /** The window settled somewhere new, or the board changed size. */
  onWindow?: () => void;
}

const FLASH_MS = 420;
/** The inlay frets, for the rail. */
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21];

export class Board {
  readonly root: HTMLElement;
  readonly theme: BoardTheme;
  layout: BoardLayout;
  /** Draw on top of the board: called after everything else with the context in CSS pixels. */
  overlay: ((ctx: CanvasRenderingContext2D, layout: BoardLayout, start: number) => void) | null = null;
  /** When set, the rail and shift buttons do nothing: the game is steering. */
  panLocked = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fretboard: Fretboard;
  private readonly wrap: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly track: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly observer: ResizeObserver;
  private readonly options: BoardOptions;

  private start = 0;
  private target = 0;
  private frame = 0;
  private lastTick = 0;
  private dirty = true;
  private flashes: { cell: Cell; color: string; born: number }[] = [];
  private readonly pointers = new Set<number>();
  private settleWaiters: (() => void)[] = [];
  /** The pointer dragging the rail, or -1. */
  private railFinger = -1;
  private destroyed = false;

  constructor(options: BoardOptions) {
    this.options = options;
    this.theme = readTheme();
    this.canvas = el('canvas.board-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.wrap = el('div.board-wrap', {}, this.canvas);

    this.thumb = el('div.rail-thumb');
    this.track = el(
      'div.rail-track',
      {},
      INLAYS.filter((fret) => fret <= options.frets).map((fret) => el(`span.rail-dot${fret === 12 ? '.octave' : ''}`, { style: `left: ${this.railPercent(fret - 0.5)}%` })),
      this.thumb,
    );
    const lower = el('button.rail-shift', { type: 'button', 'aria-label': 'Toward the nut', onclick: () => this.shift(-1) }, options.hand === 'left' ? '▶' : '◀');
    const higher = el('button.rail-shift', { type: 'button', 'aria-label': 'Toward the body', onclick: () => this.shift(1) }, options.hand === 'left' ? '◀' : '▶');
    // The nut is on the left for a right-handed player, so "lower" is too.
    this.rail = el('div.rail', { hidden: true }, options.hand === 'left' ? [higher, this.track, lower] : [lower, this.track, higher]);
    this.root = el(`div.board.${options.hand}`, {}, this.wrap, this.rail);

    this.layout = this.makeLayout(700, 320);
    this.fretboard = new Fretboard(this.layout, this.theme, options.openStrings === false ? [] : options.tuning.open.map((midi) => SHARP_NAMES[pc(midi)]));

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.track.addEventListener('pointerdown', this.onRail);
    this.track.addEventListener('pointermove', this.onRail);
    this.track.addEventListener('pointerup', this.onRailEnd);
    this.track.addEventListener('pointercancel', this.onRailEnd);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.wrap);
    this.frame = requestAnimationFrame(this.tick);
    // The canvas asks for the page's fonts by name, which does not load them.
    // Fetch them, and draw again once they are in.
    const fonts = [`600 16px 'Space Grotesk'`, `600 16px Orbitron`, `700 16px Orbitron`];
    void Promise.all(fonts.map((font) => document.fonts.load(font))).then(() => this.invalidate(), () => undefined);
    // For poking at the board from the console on the dev server.
    if (import.meta.env.DEV) (window as unknown as { __board?: Board }).__board = this;
  }

  /** Keep hearing from a pointer after it leaves the element. Not every pointer can be held. */
  private static hold(target: Element, pointerId: number): void {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // A pointer that is already gone, or one made by a script.
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
    this.settleWaiters = [];
  }

  // --- the window ----------------------------------------------------------

  private makeLayout(width: number, height: number): BoardLayout {
    return new BoardLayout({
      width,
      height,
      strings: this.options.tuning.open.length,
      visible: visibleFrets(width, this.options.frets),
      hand: this.options.hand,
      lastFret: this.options.frets,
    });
  }

  private resize(): void {
    const box = this.wrap.getBoundingClientRect();
    if (box.width < 10 || box.height < 10) return;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(box.width * ratio);
    this.canvas.height = Math.round(box.height * ratio);
    this.layout = this.makeLayout(box.width, box.height);
    this.fretboard.layout = this.layout;
    // A neck that is shown whole has nothing to scroll: the rail goes, and the
    // board takes its room (which lands back here with the new height).
    this.rail.hidden = !this.scrolls;
    this.target = this.layout.clampStart(this.target);
    this.start = this.layout.clampStart(this.start);
    this.dirty = true;
    this.paintRail();
    this.options.onWindow?.();
  }

  /** Whether the neck is longer than the window, so that there is somewhere to scroll to. */
  get scrolls(): boolean {
    return this.layout.maxStart > 0;
  }

  /** Where the window is heading: the fret position at its nut-side edge. */
  get windowStart(): number {
    return this.target;
  }

  /** The first and last whole frets in the window once it has settled. With the nut in view the open strings are in it too, as fret 0. */
  get windowFrets(): { first: number; last: number } {
    const start = Math.round(this.target);
    return { first: start === 0 ? 0 : start + 1, last: Math.min(this.options.frets, start + this.layout.visible) };
  }

  get settled(): boolean {
    return Math.abs(this.target - this.start) < 0.002;
  }

  /** Resolves once the window has stopped moving. */
  whenSettled(): Promise<void> {
    if (this.settled) return Promise.resolve();
    return new Promise((resolve) => this.settleWaiters.push(resolve));
  }

  panTo(start: number, instant = false): void {
    this.target = this.layout.clampStart(start);
    if (instant) this.start = this.target;
    this.dirty = true;
    this.paintRail();
  }

  /** Move the window as little as it takes to show these cells. */
  show(cells: readonly Cell[], instant = false): void {
    if (cells.length === 0) return;
    const frets = cells.map((c) => c.fret);
    this.panTo(Math.round(this.layout.startShowing(Math.min(...frets), Math.max(...frets), this.target)), instant);
  }

  /** Put a fret in the middle of the window. */
  centreOn(fret: number, instant = false): void {
    this.panTo(Math.round(this.layout.startCentredOn(fret - 0.5)), instant);
  }

  private shift(direction: number): void {
    if (this.panLocked) return;
    unlock();
    this.panTo(Math.round(this.target) + direction * Math.max(1, this.layout.visible - 2));
  }

  // --- the rail ------------------------------------------------------------

  /** Where along the rail a neck position sits, as a percentage from the left. */
  private railPercent(pos: number): number {
    const along = (pos / this.options.frets) * 100;
    return this.options.hand === 'left' ? 100 - along : along;
  }

  private paintRail(): void {
    const width = (this.layout.visible / this.options.frets) * 100;
    const nutSide = (this.target / this.options.frets) * 100;
    this.thumb.style.width = `${width}%`;
    this.thumb.style.left = `${this.options.hand === 'left' ? 100 - nutSide - width : nutSide}%`;
  }

  private onRail = (e: PointerEvent): void => {
    if (this.panLocked) return;
    if (e.type === 'pointerdown') {
      unlock();
      Board.hold(this.track, e.pointerId);
      this.railFinger = e.pointerId;
    } else if (this.railFinger !== e.pointerId) return;
    const box = this.track.getBoundingClientRect();
    let along = (e.clientX - box.left) / box.width;
    if (this.options.hand === 'left') along = 1 - along;
    // The finger holds the middle of the window, and the window follows it directly.
    this.panTo(along * this.options.frets - this.layout.visible / 2, true);
  };

  private onRailEnd = (e: PointerEvent): void => {
    if (this.railFinger !== e.pointerId) return;
    this.railFinger = -1;
    // Come to rest on a whole fret.
    this.panTo(Math.round(this.target));
  };

  // --- what is drawn ---------------------------------------------------------

  setNotes(notes: NoteRenderData[]): void {
    this.fretboard.setNotes(notes);
    this.dirty = true;
  }

  setLines(lines: LineData[]): void {
    this.fretboard.setLines(lines);
    this.dirty = true;
  }

  setDead(dead: ReadonlySet<string>): void {
    this.fretboard.setDead(dead);
    this.dirty = true;
  }

  setTinted(cells: ReadonlySet<string>, color = this.theme.good): void {
    this.fretboard.setTinted(cells.size ? { cells, color } : null);
    this.dirty = true;
  }

  setDeflection(deflection: Deflection | null): void {
    this.fretboard.setDeflection(deflection);
    this.dirty = true;
  }

  setGlowString(index: number | null, color = this.theme.orange): void {
    this.fretboard.setGlowString(index === null ? null : { index, color });
    this.dirty = true;
  }

  setGlowFret(fret: number | null, color = this.theme.orange): void {
    this.fretboard.setGlowFret(fret === null ? null : { fret, color });
    this.dirty = true;
  }

  flash(cell: Cell, color: string): void {
    this.flashes.push({ cell, color, born: performance.now() });
    this.dirty = true;
  }

  invalidate(): void {
    this.dirty = true;
  }

  get noteRadius(): number {
    return this.fretboard.noteRadius;
  }

  intervalColor(label: string): string {
    return this.fretboard.intervalColor(label);
  }

  /** Where a cell is on the canvas right now. */
  centre(cell: Cell): { x: number; y: number } {
    return this.layout.center(cell, this.start);
  }

  private tick = (time: number): void => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(64, time - (this.lastTick || time));
    this.lastTick = time;

    if (!this.settled) {
      this.start += (this.target - this.start) * (1 - Math.exp(-dt / 70));
      if (this.settled) this.start = this.target;
      this.dirty = true;
      if (this.settled) this.options.onWindow?.();
    }
    if (this.settled && this.settleWaiters.length) {
      const waiters = this.settleWaiters;
      this.settleWaiters = [];
      waiters.forEach((w) => w());
    }
    if (this.flashes.length) {
      this.flashes = this.flashes.filter((f) => time - f.born < FLASH_MS);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;

    const ratio = this.canvas.width / this.layout.width;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.fretboard.setStartFret(this.start);
    this.fretboard.setFlashes(this.flashes.map((f) => ({ cell: f.cell, color: f.color, age: (time - f.born) / FLASH_MS })));
    this.fretboard.render(this.ctx);
    this.overlay?.(this.ctx, this.layout, this.start);
  };

  // --- touches -------------------------------------------------------------

  private touchOf(e: PointerEvent): BoardTouch {
    const box = this.canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const { pos, string } = this.layout.locate(x, y, this.start);
    const at = this.layout.cellAt(x, y, this.start);
    const cell = at && at.fret === 0 && this.options.openStrings === false ? null : at;
    return { id: e.pointerId, x, y, cell, string, pos, time: e.timeStamp || performance.now() };
  }

  private onPointerDown = (e: PointerEvent): void => {
    unlock();
    // A finger that slides off the board keeps talking to it: a bend is not
    // handed to the next string, or dropped at the edge of the canvas.
    Board.hold(this.canvas, e.pointerId);
    this.pointers.add(e.pointerId);
    this.options.onDown?.(this.touchOf(e));
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.options.onMove?.(this.touchOf(e));
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    this.options.onUp?.(this.touchOf(e));
  };
}
