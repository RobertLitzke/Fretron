// The guitar voice: an electric guitar through a warm, lightly driven amp.
//
// The string is a physical model (stringProcessor.ts), so its tone changes as
// it rings the way a real one does. It goes into one amp shared by every
// string, so that a chord distorts as one: a humbucker's soft top, a gentle
// clipper, a closed-back speaker cabinet and a small room.

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

/** The amp, from its input to `out`. Returns the input. */
export function buildAmp(c: BaseAudioContext, out: AudioNode): AudioNode {
  const input = c.createGain();
  // A humbucker under a cable: no resonant peak to speak of, little past 4 kHz.
  const pickup = biquad(c, 'lowpass', 3600, 0.6);
  // Low strings into a clipper turn to mud: keep the bottom out of it.
  const tight = biquad(c, 'highpass', 100, 0.5);
  const drive = c.createGain();
  drive.gain.value = 2.2;
  const shaper = c.createWaveShaper();
  shaper.curve = driveCurve(1.4, 0.12);
  shaper.oversample = '4x';
  // The cabinet: some thump, a falling top, and the fizz the clipper makes
  // above 4 kHz taken away. Two lowpasses make a steep slope.
  const thump = biquad(c, 'lowshelf', 180, 0, 3);
  const top = biquad(c, 'highshelf', 2200, 0, -4);
  const cab1 = biquad(c, 'lowpass', 4000, 0.55);
  const cab2 = biquad(c, 'lowpass', 4600, 0.55);
  const level = c.createGain();
  level.gain.value = 0.36;
  input.connect(pickup).connect(tight).connect(drive).connect(shaper);
  shaper.connect(thump).connect(top).connect(cab1).connect(cab2).connect(level).connect(out);
  const room = c.createConvolver();
  room.buffer = roomImpulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.18;
  level.connect(room).connect(wet).connect(out);
  return input;
}

/**
 * A string plucked at `when`. A plucked note rings for about `ring` times
 * seven seconds; a held one (`hold` above zero) sustains for a bend to be
 * found by ear.
 */
export function strikeGuitar(c: BaseAudioContext, amp: AudioNode, hz: number, when: number, level: number, ring: number, hold: number): StringNodes {
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
  node.connect(gain).connect(amp);
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
