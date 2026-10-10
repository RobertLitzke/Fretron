// A little show when a bend is let go: a glow and sparkles round the note for
// one that lands, a dim flash and a shake for one that is off. It is drawn in a
// view's board overlay and lasts under a second; it never holds up a touch.

import type { Grade } from '../../core/bend';

const GOOD_MS = 900;
const OFF_MS = 420;

/** How many sparkles each grade throws. */
const SPARKS: Record<Grade, number> = { bullseye: 18, intune: 12, acceptable: 6, off: 0 };

interface Spark {
  angle: number;
  /** How far it flies, in note radii. */
  reach: number;
  size: number;
  /** Where in its twinkle it starts. */
  phase: number;
  white: boolean;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class BendFx {
  private grade: Grade | null = null;
  private born = 0;
  private sparks: Spark[] = [];

  /** Start the show for a bend just let go. */
  burst(grade: Grade, now = performance.now()): void {
    this.grade = grade;
    this.born = now;
    const count = SPARKS[grade];
    this.sparks = Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * 2 * Math.PI + Math.random() * 0.5,
      reach: 1.8 + Math.random() * (grade === 'bullseye' ? 2.4 : 1.6),
      size: 2 + Math.random() * (grade === 'bullseye' ? 3 : 2),
      phase: Math.random() * 2 * Math.PI,
      white: Math.random() < 0.4,
    }));
  }

  clear(): void {
    this.grade = null;
  }

  /**
   * Whether the board must be redrawn for the show. Call it every frame: it
   * stays true for the frame after the show ends, so that frame wipes it.
   */
  tick(now = performance.now()): boolean {
    if (this.grade === null) return false;
    if (now - this.born > this.length) this.grade = null;
    return true;
  }

  /** How far sideways, in pixels, to shake whatever names an off bend. 0 otherwise. */
  shake(now = performance.now()): number {
    if (this.grade !== 'off' || reducedMotion()) return 0;
    const t = (now - this.born) / OFF_MS;
    return t >= 1 ? 0 : Math.sin(t * Math.PI * 7) * 6 * (1 - t);
  }

  /** Draw round a note at (x, y) of `radius`, in `color` (the grade's). */
  draw(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, now = performance.now()): void {
    if (this.grade === null) return;
    const t = (now - this.born) / this.length;
    if (t < 0 || t >= 1) return;
    g.save();
    if (this.grade === 'off') this.drawOff(g, x, y, radius, color, t);
    else this.drawGood(g, x, y, radius, color, t);
    g.restore();
  }

  private get length(): number {
    return this.grade === 'off' ? OFF_MS : GOOD_MS;
  }

  private drawGood(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, t: number): void {
    const ease = 1 - (1 - t) ** 3;
    g.globalCompositeOperation = 'lighter';

    // The glow: swells out from the note and fades.
    const strength = this.grade === 'acceptable' ? 0.35 : this.grade === 'intune' ? 0.5 : 0.65;
    const glowR = radius * (1.4 + 2 * ease);
    const glow = g.createRadialGradient(x, y, radius * 0.6, x, y, glowR);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    g.globalAlpha = strength * (1 - t);
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, glowR, 0, 2 * Math.PI);
    g.fill();

    // A ring that runs out ahead of it.
    g.globalAlpha = 0.7 * (1 - t);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, radius * (1.1 + 2.6 * ease), 0, 2 * Math.PI);
    g.stroke();

    // The sparkles: thrown out, slowing, twinkling as they go.
    for (const s of this.sparks) {
      const d = radius * (1 + s.reach * ease);
      const sx = x + Math.cos(s.angle) * d;
      const sy = y + Math.sin(s.angle) * d;
      const twinkle = 0.6 + 0.4 * Math.sin(s.phase + t * 18);
      g.globalAlpha = Math.max(0, (1 - t) * twinkle);
      g.fillStyle = s.white ? '#ffffff' : color;
      star(g, sx, sy, s.size * (1 - 0.5 * t));
    }
  }

  private drawOff(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, t: number): void {
    // The board dims for a moment.
    g.globalAlpha = 0.28 * (1 - t);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    // And a dull ring closes in on the note.
    g.globalAlpha = 0.55 * (1 - t);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x + this.shake(this.born + t * OFF_MS), y, radius * (2.2 - 0.9 * t), 0, 2 * Math.PI);
    g.stroke();
  }
}

/** A four-pointed sparkle. */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const w = r * 0.28;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + w, y - w, x + r, y);
  g.quadraticCurveTo(x + w, y + w, x, y + r);
  g.quadraticCurveTo(x - w, y + w, x - r, y);
  g.quadraticCurveTo(x - w, y - w, x, y - r);
  g.fill();
}
