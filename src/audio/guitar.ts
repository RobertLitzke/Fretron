// The guitar voice: an electric guitar through a warm amp with a little gain.
//
// The string is a physical model (stringProcessor.ts), so its tone changes as
// it rings the way a real one does. Single notes go through a gentle clipper
// in one path (a clean copy blended back in beside it combs against it and
// sounds metallic); chords skip it, where clipping would smear them. Both then
// go through a humbucker's soft top, a speaker cabinet and a small room.

import { STRING_PROCESSOR } from './stringProcessor';

/** A struck string, whichever voice made it. */
export interface StringNodes {
  /** Cents away from the note: a bend. */
  detune: AudioParam;
  /** The string's level after the pluck. */
  gain: GainNode;
  stop(when: number): void;
}

/** Load the string model. Until it is loaded the guitar voice falls back to the synth. */
export function loadString(c: BaseAudioContext): Promise<void> {
  const url = URL.createObjectURL(new Blob([STRING_PROCESSOR], { type: 'text/javascript' }));
  return c.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
}

/** A soft clipper that leans slightly one way, as a valve does. */
function driveCurve(amount: number, lean: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  const offset = Math.tanh(amount * lean);
  const norm = Math.tanh(amount * (1 + lean)) - offset;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = (Math.tanh(amount * (x + lean)) - offset) / norm;
  }
  return curve;
}

/** A small, dark room: decaying noise that loses its top as it goes. */
function roomImpulse(c: BaseAudioContext): AudioBuffer {
  const length = Math.floor(c.sampleRate * 1.1);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate;
      const k = 0.5 * Math.exp(-t / 0.25) + 0.05;
      lp += k * (Math.random() * 2 - 1 - lp);
      data[i] = t < 0.015 ? 0 : lp * Math.exp(-t / 0.28);
    }
  }
  return buffer;
}

function biquad(c: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number, gain = 0): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/** Where a string goes in: through the overdrive, or straight to the amp. */
export interface Amp {
  drive: AudioNode;
  clean: AudioNode;
}

/** The overdrive and amp, ending at `out`. */
export function buildAmp(c: BaseAudioContext, out: AudioNode): Amp {
  // A humbucker under a cable: no resonant peak to speak of, little past 4 kHz.
  const drive = biquad(c, 'lowpass', 3800, 0.6);
  const clean = biquad(c, 'lowpass', 3800, 0.6);
  const amp = c.createGain();

  // Low gain: enough to round the peaks and thicken the note, not to fizz.
  // Low strings into a clipper turn to mud, so the bottom is kept out of it.
  const tight = biquad(c, 'highpass', 90, 0.5);
  const push = c.createGain();
  push.gain.value = 1.7;
  const shaper = c.createWaveShaper();
  shaper.curve = driveCurve(1.3, 0.1);
  shaper.oversample = '4x';
  drive.connect(tight).connect(push).connect(shaper).connect(amp);
  // Without the clipper a chord is quieter than a driven note: bring it up level.
  const chord = c.createGain();
  chord.gain.value = 1.3;
  clean.connect(chord).connect(amp);

  // The cabinet: some thump, a falling top, and a steep slope to take off the
  // fizz the clipper makes above 4 kHz.
  const thump = biquad(c, 'lowshelf', 180, 0, 3);
  const top = biquad(c, 'highshelf', 2400, 0, -3);
  const cab1 = biquad(c, 'lowpass', 4200, 0.55);
  const cab2 = biquad(c, 'lowpass', 4800, 0.55);
  const level = c.createGain();
  level.gain.value = 0.42;
  amp.connect(thump).connect(top).connect(cab1).connect(cab2).connect(level).connect(out);
  const room = c.createConvolver();
  room.buffer = roomImpulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.18;
  level.connect(room).connect(wet).connect(out);
  return { drive, clean };
}

/**
 * A string plucked at `when`. A plucked note rings for about `ring` times
 * seven seconds; a held one (`hold` above zero) sustains for a bend to be
 * found by ear.
 */
export function strikeGuitar(c: BaseAudioContext, input: AudioNode, hz: number, when: number, level: number, ring: number, hold: number): StringNodes {
  const node = new AudioWorkletNode(c, 'fretron-string', {
    numberOfInputs: 0,
    outputChannelCount: [1],
    processorOptions: { frequency: hz, startAt: when, level, pick: 0.13 + Math.random() * 0.05 },
  });
  node.parameters.get('frequency')!.value = hz;
  node.parameters.get('decay')!.value = hold > 0 ? 7 : Math.max(1, ring * 8);
  const detune = node.parameters.get('detune')!;
  const gain = c.createGain();
  gain.gain.value = 1;
  node.connect(gain).connect(input);
  return {
    detune,
    gain,
    stop(at: number) {
      // A cut that short of silence would click: fade the last moment.
      gain.gain.setTargetAtTime(0, Math.max(c.currentTime, at - 0.12), 0.025);
      node.port.postMessage({ stopAt: at });
    },
  };
}
