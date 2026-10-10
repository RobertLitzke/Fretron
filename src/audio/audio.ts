// Sound: plucked notes, a string that can be bent while it rings, and the few
// arcade noises. One AudioContext for the whole app.
//
// The string tone is FretFalcon's (ts/sounds/note_sounds.ts, getGuitarWave): a
// strong fundamental with harmonics falling away. Here it is given a pluck's
// envelope and a filter that closes as the note dies.
//
// The other voice, "guitar", is an electric guitar through a warm amp; it is
// guitar.ts. The arcade noises are the same for both.

import { contourDuration, type Contour } from '../core/bend';
import { midiToHz } from '../core/music';
import { buildAmp, loadString, strikeGuitar, type Amp, type StringNodes } from './guitar';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wave: PeriodicWave | null = null;
let noise: AudioBuffer | null = null;
let volume = 0.8;
let amp: Amp | null = null;
let stringReady: Promise<void> = Promise.resolve();
let stringLoaded = false;

export type Voice = 'synth' | 'guitar';
let voice: Voice = 'synth';

export function setVoice(v: Voice): void {
  voice = v;
}

/** Loudness of the whole app at full volume. */
const HEADROOM = 0.55;

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume * HEADROOM;
    // A limiter: three strings ringing together should not clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    wave = ctx.createPeriodicWave(new Float32Array(9), new Float32Array([0, 1, 0.5, 0.25, 0.14, 0.08, 0.05, 0.03, 0.02]));
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    amp = buildAmp(ctx, master);
    stringReady = loadString(ctx).then(
      () => void (stringLoaded = true),
      () => undefined,
    );
  }
  return ctx;
}

/** Browsers keep audio shut until a tap. Call this from one. */
export function unlock(): void {
  const c = context();
  if (c.state === 'suspended') void c.resume();
}

export function setVolume(v: number): void {
  volume = v;
  if (ctx && master) master.gain.setTargetAtTime(v * HEADROOM, ctx.currentTime, 0.03);
}

export function now(): number {
  return context().currentTime;
}

/** Settles once the guitar voice's string has loaded (or failed to). */
export function voiceReady(): Promise<void> {
  context();
  return stringReady;
}

/**
 * One string, struck at `when`: an oscillator into a closing filter into an
 * envelope. A plucked note dies away to nothing; a held one (`hold` above zero)
 * settles at that level with the filter left further open, so that a bend can
 * be found by ear.
 */
function strike(midi: number, when: number, level: number, ring: number, hold = 0, clean = false): StringNodes {
  if (voice === 'guitar' && stringLoaded) {
    return strikeGuitar(context(), clean ? amp!.clean : amp!.drive, midiToHz(midi), when, level, ring, hold);
  }
  return strikeSynth(midi, when, level, ring, hold);
}

function strikeSynth(midi: number, when: number, level: number, ring: number, hold: number): StringNodes {
  const c = context();
  const osc = c.createOscillator();
  osc.setPeriodicWave(wave!);
  osc.frequency.value = midiToHz(midi);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(5200, when);
  filter.frequency.setTargetAtTime(hold > 0 ? 2200 : 1100, when, hold > 0 ? 0.4 : 0.22);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.004);
  gain.gain.setTargetAtTime(hold, when + 0.004, ring);
  osc.connect(filter).connect(gain).connect(master!);
  osc.start(when);
  return { detune: osc.detune, gain, stop: (at) => osc.stop(at) };
}

export interface PluckOptions {
  /** Seconds from now. */
  delay?: number;
  /** 0 to 1. */
  level?: number;
  /** How long the note rings: the time for it to fall to about a third. */
  ring?: number;
  /** Part of a chord: the guitar voice plays it without overdrive. */
  chord?: boolean;
}

export function pluck(midi: number, options: PluckOptions = {}): void {
  const c = context();
  const when = c.currentTime + (options.delay ?? 0);
  const ring = options.ring ?? 0.45;
  strike(midi, when, options.level ?? 0.5, ring, 0, options.chord).stop(when + ring * 7);
}

/** Several strings struck one after another, low to high: a chord. */
export function strum(midis: readonly number[], gap = 0.035, options: PluckOptions = {}): void {
  midis.forEach((m, i) => pluck(m, { ...options, chord: true, delay: (options.delay ?? 0) + i * gap }));
}

/** The level a held string settles at. */
const HELD = 0.3;

/** A string held under a finger: it rings on, and its pitch follows the bend. */
export class BendVoice {
  private nodes: StringNodes | null = null;

  start(midi: number): void {
    this.stop();
    const c = context();
    this.nodes = strike(midi, c.currentTime, 0.5, 0.5, HELD);
  }

  setCents(cents: number): void {
    if (!this.nodes) return;
    this.nodes.detune.setTargetAtTime(cents, context().currentTime, 0.008);
  }

  /** A bullseye's reward: the note swells into a vibrato before it fades. */
  bloom(): void {
    if (!this.nodes) return;
    const c = context();
    const t = c.currentTime;
    const { detune, gain, stop } = this.nodes;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(16, t + 0.25);
    lfo.connect(depth).connect(detune);
    lfo.start(t);
    lfo.stop(t + 1.3);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(gain.gain.value * 1.4, t, 0.08);
    gain.gain.setTargetAtTime(0, t + 0.7, 0.18);
    stop(t + 1.5);
    this.nodes = null;
  }

  stop(fade = 0.06): void {
    if (!this.nodes) return;
    const t = context().currentTime;
    this.nodes.gain.gain.cancelScheduledValues(t);
    this.nodes.gain.gain.setTargetAtTime(0, t, fade / 3);
    this.nodes.stop(t + fade * 2 + 0.05);
    this.nodes = null;
  }

  /** Let it ring out as a plucked note would. */
  release(): void {
    this.stop(0.5);
  }
}

/** Play a bend over time: the prompt of the trace game. Returns a way to cut it short. */
export function playContour(midi: number, contour: Contour): () => void {
  const c = context();
  const when = c.currentTime + 0.05;
  const nodes = strike(midi, when, 0.5, 0.5, HELD);
  nodes.detune.setValueAtTime(contour.points[0].cents, when);
  for (const p of contour.points.slice(1)) nodes.detune.linearRampToValueAtTime(p.cents, when + p.t);
  const end = when + contourDuration(contour);
  nodes.gain.gain.setTargetAtTime(0, end, 0.08);
  nodes.stop(end + 0.5);
  let cut = false;
  return () => {
    if (cut) return;
    cut = true;
    const t = c.currentTime;
    if (t >= end) return;
    nodes.gain.gain.cancelScheduledValues(t);
    nodes.gain.gain.setTargetAtTime(0, t, 0.02);
    nodes.stop(t + 0.15);
  };
}

/** A fretted string that did not ring: a wrong note. */
export function thud(): void {
  const c = context();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  src.connect(filter).connect(gain).connect(master!);
  src.start(t);
  src.stop(t + 0.1);
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
  const body = c.createGain();
  body.gain.setValueAtTime(0.5, t);
  body.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  osc.connect(body).connect(master!);
  osc.start(t);
  osc.stop(t + 0.12);
}

/** A wrong chord: two notes a semitone apart, rasping. */
export function buzz(): void {
  const c = context();
  const t = c.currentTime;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1300;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  filter.connect(gain).connect(master!);
  for (const hz of [98, 104]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/** A short electronic blip, for the count-in and for things that are not notes. */
export function blip(hz = 1320, length = 0.05, level = 0.18): void {
  const c = context();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = hz;
  const gain = c.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(master!);
  osc.start(t);
  osc.stop(t + length + 0.01);
}

/** A run finished. */
export function fanfare(): void {
  [52, 59, 64, 68, 71, 76].forEach((m, i) => pluck(m, { delay: i * 0.07, level: 0.4, ring: 0.5, chord: true }));
}
