// The beat behind Bend Trace: a click, or a soft kit (kick, cross-stick and
// hi-hat), kept quiet under the string. Scheduled a little ahead on the audio
// clock, so it holds time whatever the page is doing.

import type { BeatStyle } from '../core/storage';
import { heardAt, mixer, now } from './audio';

/** Beats in a bar: the first of each is accented. */
export const BAR = 4;
/** Beats counted in before a bend is heard or played. */
export const COUNT_IN = 2;
/** How far ahead beats are put on the audio clock, and how often that is topped up. */
const AHEAD = 0.15;
const TICK_MS = 25;

function click(t: number, accent: boolean): void {
  const { ctx, out } = mixer();
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1760 : 1320;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(accent ? 0.16 : 0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.05);
}

function kick(t: number, level: number): void {
  const { ctx, out } = mixer();
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.3);
}

function noiseHit(t: number, type: BiquadFilterType, hz: number, q: number, level: number, length: number): void {
  const { ctx, out, noise } = mixer();
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = hz;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(t);
  src.stop(t + length + 0.01);
}

/** A cross-stick: a woody knock rather than a full snare. */
function crossStick(t: number): void {
  noiseHit(t, 'bandpass', 1900, 3, 0.22, 0.06);
  const { ctx, out } = mixer();
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 420;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.06);
}

function hat(t: number, level: number): void {
  noiseHit(t, 'highpass', 7000, 0.7, level, 0.04);
}

/** Where beat `index` falls in its bar, from 0: beats before beat 0 count back from the end of a bar. */
export function inBar(index: number): number {
  return ((index % BAR) + BAR) % BAR;
}

/** One beat of the kit, with the off-beat hat half a beat after it. A count-in is sticks alone. */
function kitBeat(t: number, index: number, beat: number, count: boolean): void {
  if (count) {
    crossStick(t);
    return;
  }
  const at = inBar(index);
  if (at === 0) kick(t, 0.42);
  else if (at === 2) kick(t, 0.3);
  else crossStick(t);
  hat(t, 0.05);
  hat(t + beat / 2, 0.03);
}

export class Metronome {
  private timer: ReturnType<typeof setInterval> | null = null;
  private zero = 0;
  private beat = 0.5;
  private nextIndex = 0;
  /** Beats played as a count-in, not as part of the groove. */
  private counts = new Set<number>();

  constructor(private readonly style: BeatStyle) {}

  get on(): boolean {
    return this.style !== 'off';
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Start beating at `bpm`, beat 0 at audio time `at`, after `countIn` beats counted in before it. */
  start(bpm: number, at: number, countIn = 0): void {
    this.stop();
    if (!this.on) return;
    this.beat = 60 / bpm;
    this.zero = at;
    this.nextIndex = -countIn;
    this.counts.clear();
    this.countInto(0, countIn);
    this.fill();
    this.timer = setInterval(() => this.fill(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Play the `beats` beats before beat `index` as a count-in to it. */
  countInto(index: number, beats = COUNT_IN): void {
    for (let i = index - beats; i < index; i++) this.counts.add(i);
  }

  /** On the page's clock (ms), when beat `index` is heard. */
  heard(index: number): number {
    return heardAt(this.zero + index * this.beat);
  }

  /** The beat nearest to page time `ms`, and when it is heard. */
  nearest(ms: number): { index: number; at: number } {
    const zero = this.heard(0);
    const index = Math.round((ms - zero) / (this.beat * 1000));
    return { index, at: zero + index * this.beat * 1000 };
  }

  private fill(): void {
    const until = now() + AHEAD;
    for (;;) {
      const t = this.zero + this.nextIndex * this.beat;
      if (t > until) break;
      // Beats that fell behind (a hidden tab) are skipped, not played in a heap.
      if (t >= now() - 0.02) {
        const count = this.counts.has(this.nextIndex);
        if (this.style === 'click') click(t, !count && inBar(this.nextIndex) === 0);
        else kitBeat(t, this.nextIndex, this.beat, count);
      }
      this.nextIndex++;
    }
  }
}
