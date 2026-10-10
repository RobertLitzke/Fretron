// Sound: plucked notes, a string that can be bent while it rings, and the few
// arcade noises. One AudioContext for the whole app.
//
// The string tone is FretFalcon's (ts/sounds/note_sounds.ts, getGuitarWave): a
// strong fundamental with harmonics falling away. Here it is given a pluck's
// envelope and a filter that closes as the note dies.
//
// The other voice, "guitar", is meant to sound like an electric guitar through a
// warm amp: a plucked string's spectrum with a pick's click, into a soft clipper
// (light overdrive), a humbucker's dark top and a speaker cabinet, with a little
// room around it. The arcade noises are the same for both.

import { contourDuration, type Contour } from '../core/bend';
import { midiToHz } from '../core/music';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wave: PeriodicWave | null = null;
let noise: AudioBuffer | null = null;
let volume = 0.8;
let amp: AudioNode | null = null;
let stringWave: PeriodicWave | null = null;

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
    stringWave = pluckedWave(ctx);
    amp = buildAmp(ctx, master);
  }
  return ctx;
}

/**
 * A string plucked a fifth of the way along: every harmonic that has a node
 * near the pick is missing, and the rest fall away more slowly than the synth's.
 */
function pluckedWave(c: BaseAudioContext): PeriodicWave {
  const n = 40;
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = Math.abs(Math.sin(k * Math.PI * 0.19)) / Math.pow(k, 1.05);
  return c.createPeriodicWave(new Float32Array(n), imag);
}

/** A soft clipper that leans one way, as a valve does: the even harmonics make it warm. */
function driveCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = x + 0.18 * x * x;
    curve[i] = Math.tanh(amount * y) / norm - 0.18 * Math.tanh(amount * 0.18) / norm;
  }
  return curve;
}

/** A short, dark room: decaying noise, a little wider in the lows than the highs. */
function roomImpulse(c: BaseAudioContext): AudioBuffer {
  const length = Math.floor(c.sampleRate * 0.9);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate;
      lp += 0.25 * (Math.random() * 2 - 1 - lp);
      data[i] = lp * Math.exp(-t / 0.22) * (t < 0.012 ? 0 : 1);
    }
  }
  return buffer;
}

/**
 * The guitar voice's signal path, shared by every string so that a chord
 * distorts as one: pickup, overdrive, cabinet, room. Returns its input.
 */
function buildAmp(c: BaseAudioContext, out: AudioNode): AudioNode {
  const input = c.createGain();
  input.gain.value = 1;
  // A humbucker: full in the low mids, a soft peak and then little above it.
  const pickup = c.createBiquadFilter();
  pickup.type = 'lowpass';
  pickup.frequency.value = 2700;
  pickup.Q.value = 1.6;
  // Keep the lows out of the clipper so it does not turn to mud.
  const tight = c.createBiquadFilter();
  tight.type = 'highpass';
  tight.frequency.value = 110;
  tight.Q.value = 0.6;
  const drive = c.createGain();
  drive.gain.value = 3.2;
  const shaper = c.createWaveShaper();
  shaper.curve = driveCurve(1.6) as Float32Array<ArrayBuffer>;
  shaper.oversample = '4x';
  // A 12-inch speaker in a closed box: a bump in the low end, a dip in the
  // low mids, and nothing much past 5 kHz.
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 140;
  body.Q.value = 0.9;
  body.gain.value = 3;
  const scoop = c.createBiquadFilter();
  scoop.type = 'peaking';
  scoop.frequency.value = 420;
  scoop.Q.value = 1.2;
  scoop.gain.value = -3;
  const presence = c.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 1900;
  presence.Q.value = 1.4;
  presence.gain.value = 2.5;
  const cab1 = c.createBiquadFilter();
  cab1.type = 'lowpass';
  cab1.frequency.value = 4200;
  cab1.Q.value = 0.9;
  const cab2 = c.createBiquadFilter();
  cab2.type = 'lowpass';
  cab2.frequency.value = 6000;
  cab2.Q.value = 0.6;
  const level = c.createGain();
  level.gain.value = 0.4;
  input.connect(pickup).connect(tight).connect(drive).connect(shaper);
  shaper.connect(body).connect(scoop).connect(presence).connect(cab1).connect(cab2).connect(level).connect(out);
  const room = c.createConvolver();
  room.buffer = roomImpulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.16;
  level.connect(room).connect(wet).connect(out);
  return input;
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

interface StringNodes {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

/**
 * One string, struck at `when`: an oscillator into a closing filter into an
 * envelope. A plucked note dies away to nothing; a held one (`hold` above zero)
 * settles at that level with the filter left further open, so that a bend can
 * be found by ear.
 */
function strike(midi: number, when: number, level: number, ring: number, hold = 0): StringNodes {
  return voice === 'guitar' ? strikeGuitar(midi, when, level, ring, hold) : strikeSynth(midi, when, level, ring, hold);
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
  return { osc, gain, filter };
}

/**
 * The guitar voice's string. The pitch starts a touch sharp and settles, as a
 * string does when the pick lets it go; the brightness falls away faster than
 * the note; and the pick itself clicks.
 */
function strikeGuitar(midi: number, when: number, level: number, ring: number, hold: number): StringNodes {
  const c = context();
  const hz = midiToHz(midi);
  const osc = c.createOscillator();
  osc.setPeriodicWave(stringWave!);
  osc.frequency.setValueAtTime(hz * 1.006, when);
  osc.frequency.setTargetAtTime(hz, when, 0.025);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(Math.min(9000, hz * 30), when);
  filter.frequency.setTargetAtTime(Math.min(hold > 0 ? 3800 : 2600, hz * 10), when, hold > 0 ? 0.5 : 0.3);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.002);
  // The clipper evens out the fall, so it can be a little slower than the synth's.
  gain.gain.setTargetAtTime(hold, when + 0.002, ring * 1.3);
  osc.connect(filter).connect(gain).connect(amp!);
  osc.start(when);

  const click = c.createBufferSource();
  click.buffer = noise;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400;
  band.Q.value = 0.8;
  const clickGain = c.createGain();
  clickGain.gain.setValueAtTime(level * 0.35, when);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
  click.connect(band).connect(clickGain).connect(amp!);
  click.start(when);
  click.stop(when + 0.02);
  return { osc, gain, filter };
}

export interface PluckOptions {
  /** Seconds from now. */
  delay?: number;
  /** 0 to 1. */
  level?: number;
  /** How long the note rings: the time for it to fall to about a third. */
  ring?: number;
}

export function pluck(midi: number, options: PluckOptions = {}): void {
  const c = context();
  const when = c.currentTime + (options.delay ?? 0);
  const ring = options.ring ?? 0.45;
  const { osc } = strike(midi, when, options.level ?? 0.5, ring);
  osc.stop(when + ring * 7);
}

/** Several strings struck one after another, low to high. */
export function strum(midis: readonly number[], gap = 0.035, options: PluckOptions = {}): void {
  midis.forEach((m, i) => pluck(m, { ...options, delay: (options.delay ?? 0) + i * gap }));
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
    this.nodes.osc.detune.setTargetAtTime(cents, context().currentTime, 0.008);
  }

  /** A bullseye's reward: the note swells into a vibrato before it fades. */
  bloom(): void {
    if (!this.nodes) return;
    const c = context();
    const t = c.currentTime;
    const { osc, gain } = this.nodes;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(16, t + 0.25);
    lfo.connect(depth).connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + 1.3);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.42, t, 0.08);
    gain.gain.setTargetAtTime(0, t + 0.7, 0.18);
    osc.stop(t + 1.5);
    this.nodes = null;
  }

  stop(fade = 0.06): void {
    if (!this.nodes) return;
    const t = context().currentTime;
    this.nodes.gain.gain.cancelScheduledValues(t);
    this.nodes.gain.gain.setTargetAtTime(0, t, fade / 3);
    this.nodes.osc.stop(t + fade * 2 + 0.05);
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
  nodes.osc.detune.setValueAtTime(contour.points[0].cents, when);
  for (const p of contour.points.slice(1)) nodes.osc.detune.linearRampToValueAtTime(p.cents, when + p.t);
  const end = when + contourDuration(contour);
  nodes.gain.gain.setTargetAtTime(0, end, 0.08);
  nodes.osc.stop(end + 0.5);
  let cut = false;
  return () => {
    if (cut) return;
    cut = true;
    const t = c.currentTime;
    if (t >= end) return;
    nodes.gain.gain.cancelScheduledValues(t);
    nodes.gain.gain.setTargetAtTime(0, t, 0.02);
    nodes.osc.stop(t + 0.15);
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
  [52, 59, 64, 68, 71, 76].forEach((m, i) => pluck(m, { delay: i * 0.07, level: 0.4, ring: 0.5 }));
}
