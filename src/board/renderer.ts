// Fretboard canvas renderer: render-data types and the Fretboard drawing class.
//
// Ported from FretFalcon (ts/fretboard/renderer.ts, fretboard_config.ts and
// color_palette.ts). Kept from there: the string weights, the bold nut and
// bolder wires at the inlay frets, the inlay dots, the note circles with their
// faint root ring, the X overlay and outer ring, and the seven-tier interval
// palette read from CSS custom properties. Changed for the game: the window
// slides to a fractional fret, cells can be greyed out, a string can be drawn
// bent, and where things sit comes from core/geometry.ts so that touches and
// drawing share one mapping.

import { carriedOffsets, PAD_NUT, type BoardLayout } from '../core/geometry';
import type { Cell } from '../core/music';

export interface NoteRenderData {
  fret: number;
  stringIndex: number;
  /** 'R', 'b3', '5'...: picks the fill from the interval palette when none is given. */
  intervalLabel?: string;
  displayLabel?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Explicit colour for the label (for hollow notes). */
  labelColor?: string;
  /** A multiple of the usual radius. */
  radiusScale?: number;
  opacity?: number;
  dashed?: boolean;
  xOverlay?: boolean;
  outerRing?: boolean;
  /** A halo in this colour. */
  glow?: string;
  /** Pixels the note is pushed across the neck: where a bent string is held. */
  offsetY?: number;
}

export interface LineData {
  from: Cell;
  to: Cell;
  color: string;
  strokeWidth?: number;
  dashed?: boolean;
  opacity?: number;
}

/** A ring spreading out from a cell: a tap that landed, or one that did not. */
export interface FlashData {
  cell: Cell;
  color: string;
  /** 0 as it starts, 1 as it vanishes. */
  age: number;
}

/** A string pulled aside at one fret. */
export interface Deflection {
  cell: Cell;
  offsetY: number;
}

/** How close together, in pixels, a bend packs the strings it carries along. */
const CARRY_PACK = 5;

// FretFalcon's STRING_WIDTH_PRESETS, lowest string first.
const STRING_WIDTH_PRESETS: Record<number, number[]> = {
  4: [4, 2, 2, 1],
  5: [4, 3, 2, 1, 1],
  6: [4, 3, 2, 2, 1, 1],
  7: [4, 3, 2, 2, 1, 1, 1],
  8: [4, 3, 2, 2, 1, 1, 1, 1],
};

// FretFalcon's markerDots: one dot, or two at the octave.
const MARKER_DOTS = [0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 2];

// FretFalcon's interval palette: which of the seven tiers each interval takes.
const INTERVAL_TIER: Record<string, string> = {
  R: '--note-root',
  b2: '--note-second',
  '2': '--note-second',
  b3: '--note-third',
  '3': '--note-third',
  '4': '--note-fourth',
  d5: '--note-fourth',
  '#4': '--note-fourth',
  '5': '--note-fifth',
  b6: '--note-sixth',
  '#5': '--note-sixth',
  '6': '--note-sixth',
  b7: '--note-seventh',
  '7': '--note-seventh',
};

/** The colours the canvas needs, read once from the page's custom properties. */
export interface BoardTheme {
  string: string;
  fret: string;
  fretBold: string;
  nut: string;
  dead: string;
  deadEdge: string;
  panel: string;
  text: string;
  muted: string;
  danger: string;
  pivot: string;
  cyan: string;
  orange: string;
  good: string;
  tiers: Record<string, string>;
}

export function readTheme(): BoardTheme {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const tiers: Record<string, string> = {};
  for (const tier of new Set(Object.values(INTERVAL_TIER))) tiers[tier] = v(tier, '#9aabb8');
  return {
    string: v('--board-string', '#7fdcf0'),
    fret: v('--board-fret', '#25456a'),
    fretBold: v('--board-fret-bold', '#3f78a8'),
    nut: v('--board-nut', '#dff6ff'),
    dead: v('--board-dead', '#1b2434'),
    deadEdge: v('--board-dead-edge', '#2c3a52'),
    panel: v('--panel', '#070d1c'),
    text: v('--text', '#dff6ff'),
    muted: v('--muted', '#6d86a0'),
    danger: v('--danger', '#ff4d6d'),
    pivot: v('--note-pivot', '#ffd166'),
    cyan: v('--cyan', '#6fe9ff'),
    orange: v('--orange', '#ff7a1a'),
    good: v('--good', '#7dffb0'),
    tiers,
  };
}

/** Dark or light text for a filled circle, by the fill's brightness (FretFalcon's rule). */
function textColorFor(fill: string): string {
  if (!fill.startsWith('#') || fill.length < 7) return '#eee';
  const r = parseInt(fill.slice(1, 3), 16);
  const g = parseInt(fill.slice(3, 5), 16);
  const b = parseInt(fill.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#06101c' : '#eee';
}

export class Fretboard {
  private notes: NoteRenderData[] = [];
  private lines: LineData[] = [];
  private flashes: FlashData[] = [];
  private dead: ReadonlySet<string> = new Set();
  private deflection: Deflection | null = null;
  private glowString: { index: number; color: string } | null = null;
  private glowFret: { fret: number; color: string } | null = null;
  private startFret = 0;

  constructor(
    public layout: BoardLayout,
    private readonly theme: BoardTheme,
    /** What each open string is called, lowest first: written beside the nut. */
    private readonly stringNames: readonly string[] = [],
  ) {}

  setNotes(notes: NoteRenderData[]): void { this.notes = notes; }
  setLines(lines: LineData[]): void { this.lines = lines; }
  setFlashes(flashes: FlashData[]): void { this.flashes = flashes; }
  /** Cells that are out of play, as "string:fret" keys. */
  setDead(dead: ReadonlySet<string>): void { this.dead = dead; }
  setDeflection(deflection: Deflection | null): void { this.deflection = deflection; }
  setGlowString(glow: { index: number; color: string } | null): void { this.glowString = glow; }
  /** A fret lit from string to string, and its number with it. */
  setGlowFret(glow: { fret: number; color: string } | null): void { this.glowFret = glow; }
  /** The fret position at the nut-side edge of the window. May be fractional while it slides. */
  setStartFret(fret: number): void { this.startFret = Math.max(0, fret); }

  get noteRadius(): number {
    return Math.min(this.layout.spacing * 0.36, this.layout.fretLen * 0.3);
  }

  /** A note on an open string has only the room beside the nut to fit in. */
  private get openRadius(): number {
    return Math.min(this.noteRadius, PAD_NUT / 2 - 3);
  }

  /** Line weights are FretFalcon's, scaled to how far apart the strings are. */
  private get scale(): number {
    return Math.max(0.75, this.layout.spacing / 48);
  }

  getNoteCoordinates(stringIndex: number, fret: number): { x: number; y: number } {
    return this.layout.center({ string: stringIndex, fret }, this.startFret);
  }

  intervalColor(label: string): string {
    return this.theme.tiers[INTERVAL_TIER[label] ?? '--note-second'] ?? '#9aabb8';
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.layout.width, this.layout.height);
    this.renderGrid(ctx);
    this.renderDead(ctx);
    this.renderLines(ctx);
    this.renderNotes(ctx);
    this.renderFlashes(ctx);
  }

  /** First and last fret wires that can be seen, with one to spare each side. */
  private wireRange(): [number, number] {
    const first = Math.max(0, Math.floor(this.startFret));
    const last = Math.min(this.layout.lastFret, Math.ceil(this.startFret + this.layout.visible) + 1);
    return [first, last];
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const { layout, theme, startFret } = this;
    const scale = this.scale;
    const stringCount = layout.strings;
    const widths = STRING_WIDTH_PRESETS[stringCount] ?? Array(stringCount).fill(1);
    const [firstWire, lastWire] = this.wireRange();
    const stringWidth = (s: number) => (widths[s] ?? 1) * 0.8 * scale;
    // The board ends at its outer strings, as FretFalcon's does: the wires
    // stop there, flush with the string's own edge.
    const top = layout.topY - stringWidth(stringCount - 1) / 2;
    const bottom = layout.bottomY + stringWidth(0) / 2;
    const xNear = layout.x(Math.max(0, startFret - 1), startFret);
    // The board ends at the nut, and at the last fret wire.
    const xFar = layout.x(Math.min(layout.lastFret, startFret + layout.visible + 1), startFret);

    ctx.save();

    // The board itself, and a tint on the half holding the heavy strings to
    // convey weight (as FretFalcon does).
    ctx.fillStyle = theme.panel;
    ctx.fillRect(Math.min(xNear, xFar), top, Math.abs(xFar - xNear), bottom - top);
    const midY = layout.y(Math.floor(stringCount / 2) - 0.5);
    ctx.fillStyle = 'rgba(111, 233, 255, 0.035)';
    ctx.fillRect(Math.min(xNear, xFar), midY, Math.abs(xFar - xNear), bottom - midY);
    if (this.glowFret) {
      const [from, to] = layout.span(this.glowFret.fret);
      const xa = layout.x(from, startFret);
      const xb = layout.x(to, startFret);
      ctx.fillStyle = this.glowFret.color;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(Math.min(xa, xb), top, Math.abs(xb - xa), bottom - top);
      ctx.globalAlpha = 1;
    }

    // Fret wires. The nut is heaviest; wires at the inlay frets are bolder.
    ctx.lineCap = 'butt';
    for (let n = firstWire; n <= lastWire; n++) {
      const x = layout.x(n, startFret);
      const isNut = n === 0;
      const bold = isNut || MARKER_DOTS[n] > 0;
      ctx.beginPath();
      ctx.lineWidth = (isNut ? 4.5 : bold ? 2 : 1) * scale;
      ctx.strokeStyle = isNut ? theme.nut : bold ? theme.fretBold : theme.fret;
      ctx.shadowColor = isNut ? theme.cyan : 'transparent';
      ctx.shadowBlur = isNut ? 10 : 0;
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Inlay dots and fret numbers.
    const dotRadius = 5 * scale;
    ctx.font = `600 ${Math.round(11 * Math.min(1.2, scale))}px Orbitron, 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let n = Math.max(1, firstWire); n <= lastWire; n++) {
      const x = layout.x(n - 0.5, startFret);
      const marker = MARKER_DOTS[n] ?? 0;
      ctx.fillStyle = theme.fretBold;
      ctx.globalAlpha = 0.55;
      if (marker === 1) {
        ctx.beginPath();
        ctx.arc(x, (layout.topY + layout.bottomY) / 2, dotRadius, 0, 2 * Math.PI);
        ctx.fill();
      } else if (marker === 2) {
        const span = layout.bottomY - layout.topY;
        for (const k of [0.3, 0.7]) {
          ctx.beginPath();
          ctx.arc(x, layout.topY + span * k, dotRadius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      const lit = this.glowFret?.fret === n;
      ctx.globalAlpha = lit ? 1 : marker ? 0.95 : 0.5;
      ctx.fillStyle = lit ? this.glowFret!.color : marker ? theme.text : theme.muted;
      ctx.fillText(String(n), x, layout.numberY);
    }
    ctx.globalAlpha = 1;

    // The open strings, beside the nut while it is in view: each a ring to tap,
    // with the string's name in it.
    if (startFret < 0.5) {
      const x = layout.x(layout.pos(0), startFret);
      const ring = this.openRadius - 3;
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.fretBold;
      ctx.fillStyle = theme.muted;
      this.stringNames.forEach((name, s) => {
        ctx.globalAlpha = (1 - startFret * 2) * 0.6;
        ctx.beginPath();
        ctx.arc(x, layout.y(s), ring, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1 - startFret * 2;
        ctx.fillText(name, x, layout.y(s) + 0.5);
      });
      ctx.globalAlpha = 1;
    }

    // Strings, heaviest at the bottom.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A bent string carries the strings it passes along with it, kinked at the same fret.
    const bend = this.deflection;
    const carried = bend
      ? carriedOffsets(stringCount, bend.cell.string, bend.offsetY, layout.spacing, CARRY_PACK * scale)
      : null;
    for (let s = 0; s < stringCount; s++) {
      const y = layout.y(s);
      const lit = this.glowString?.index === s;
      ctx.beginPath();
      ctx.lineWidth = stringWidth(s) + (lit ? 1 : 0);
      ctx.strokeStyle = lit ? this.glowString!.color : theme.string;
      ctx.globalAlpha = lit ? 1 : 0.8;
      ctx.shadowColor = lit ? this.glowString!.color : theme.cyan;
      ctx.shadowBlur = lit ? 14 : 5;
      ctx.moveTo(xNear, y);
      if (bend && carried![s]) ctx.lineTo(layout.x(bend.cell.fret - 0.5, startFret), y + carried![s]);
      ctx.lineTo(xFar, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Cells out of play are covered by a tile, so the string under them goes
   * dim. A tile is as tall as a note, not as the gap between strings: one on
   * an outer string then hangs over the edge of the board no further than a
   * note there would.
   */
  private renderDead(ctx: CanvasRenderingContext2D): void {
    if (this.dead.size === 0) return;
    const { layout, startFret } = this;
    const [firstWire, lastWire] = this.wireRange();
    const half = Math.min(layout.spacing / 2 - 2, this.noteRadius + 2);
    ctx.save();
    ctx.fillStyle = this.theme.dead;
    ctx.strokeStyle = this.theme.deadEdge;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.93;
    for (let fret = firstWire; fret <= lastWire; fret++) {
      const [from, to] = layout.span(fret);
      for (let s = 0; s < layout.strings; s++) {
        if (!this.dead.has(`${s}:${fret}`)) continue;
        const xa = layout.x(from, startFret);
        const xb = layout.x(to, startFret);
        const left = Math.min(xa, xb) + 2;
        ctx.beginPath();
        ctx.roundRect(left + 0.5, layout.y(s) - half + 0.5, Math.abs(xb - xa) - 5, half * 2 - 1, 4);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderLines(ctx: CanvasRenderingContext2D): void {
    const scale = this.scale;
    for (const line of this.lines) {
      const a = this.layout.center(line.from, this.startFret);
      const b = this.layout.center(line.to, this.startFret);
      ctx.save();
      if (line.opacity !== undefined) ctx.globalAlpha = line.opacity;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = (line.strokeWidth ?? 2) * scale;
      ctx.setLineDash(line.dashed ? [4 * scale, 4 * scale] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderNotes(ctx: CanvasRenderingContext2D): void {
    const scale = this.scale;
    const baseRadius = this.noteRadius;
    for (const note of this.notes) {
      const displayFret = note.fret - this.startFret;
      if (displayFret < -0.5 || displayFret > this.layout.visible + 1.5) continue;
      const centre = this.getNoteCoordinates(note.stringIndex, note.fret);
      const x = centre.x;
      const y = centre.y + (note.offsetY ?? 0);
      const radius = (note.fret === 0 ? this.openRadius : baseRadius) * (note.radiusScale ?? 1);
      const fill = note.fillColor ?? this.intervalColor(note.intervalLabel ?? '');
      const stroke = note.strokeColor ?? 'transparent';

      ctx.save();
      ctx.globalAlpha = note.opacity ?? 1;
      if (note.glow) {
        ctx.shadowColor = note.glow;
        ctx.shadowBlur = 16;
      }
      if (note.dashed) ctx.setLineDash([4, 3]);
      ctx.lineWidth = (note.strokeWidth ?? 1) * scale;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      if (fill !== 'transparent') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke !== 'transparent') {
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      // A faint ring marks a root.
      if (note.intervalLabel === 'R') {
        ctx.save();
        ctx.globalAlpha = (note.opacity ?? 1) * 0.35;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2.5 * scale, 0, 2 * Math.PI);
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
        ctx.restore();
      }

      if (note.displayLabel) {
        const fontSize = Math.min(18 * scale, radius * 2 * 0.63) * (note.displayLabel.length > 2 ? 0.82 : 1);
        ctx.fillStyle = note.labelColor ?? (fill === 'transparent' ? this.theme.text : textColorFor(fill));
        ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(note.displayLabel, x, y + fontSize * 0.05);
      }

      if (note.outerRing) {
        ctx.strokeStyle = this.theme.pivot;
        ctx.lineWidth = 2.5 * scale;
        ctx.beginPath();
        ctx.arc(x, y, radius + 3 * scale, 0, 2 * Math.PI);
        ctx.stroke();
      }
      if (note.xOverlay) {
        const size = radius * 0.65;
        ctx.strokeStyle = this.theme.danger;
        ctx.lineWidth = 2.5 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - size, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.moveTo(x + size, y - size);
        ctx.lineTo(x - size, y + size);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderFlashes(ctx: CanvasRenderingContext2D): void {
    const radius = this.noteRadius;
    for (const flash of this.flashes) {
      const { x, y } = this.layout.center(flash.cell, this.startFret);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - flash.age);
      ctx.strokeStyle = flash.color;
      ctx.shadowColor = flash.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3 * (1 - flash.age) + 1;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.9 + 1.5 * flash.age), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  }
}
