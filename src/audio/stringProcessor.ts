// The guitar voice's string, as an AudioWorklet: an extended Karplus-Strong
// string (Jaffe and Smith, "Extensions of the Karplus-Strong Plucked-String
// Algorithm", 1983; https://ccrma.stanford.edu/~jos/pasp/Extended_Karplus_Strong_Algorithm.html).
//
// A delay line one period long feeds back through a gentle lowpass, so every
// harmonic dies at its own rate and the top falls away first, as on a real
// string. It is plucked by adding the shape of a pulled string into the loop,
// and the delay can be stretched or shortened while it rings, which is a bend.
//
// It is a string rather than a module so that it can be loaded from a Blob: the
// build is a single HTML file with nothing beside it to fetch.

export const STRING_PROCESSOR = /* js */ `
const SIZE = 8192;

class FretronString extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 110, minValue: 20, maxValue: 5000, automationRate: 'k-rate' },
      { name: 'detune', defaultValue: 0, minValue: -2400, maxValue: 2400, automationRate: 'k-rate' },
      // Seconds for the fundamental to fall by 60 dB.
      { name: 'decay', defaultValue: 3, minValue: 0.05, maxValue: 60, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.buf = new Float32Array(SIZE);
    this.w = 0;
    this.lp = 0;
    this.prev = 0;
    this.dcIn = 0;
    this.dcOut = 0;
    this.d = 0;
    this.age = 0;
    this.startAt = o.startAt || 0;
    this.stopAt = Infinity;
    this.port.onmessage = (e) => {
      if (typeof e.data.stopAt === 'number') this.stopAt = e.data.stopAt;
    };

    // The pluck: a string pulled aside at the pick and let go is a triangle
    // with its peak at the pick. A little noise makes each pluck its own, and
    // a one-pole lowpass rounds the pick's edge.
    const f = o.frequency || 110;
    const n = Math.max(4, Math.round(sampleRate / f));
    const pick = o.pick || 0.16;
    const ex = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const shape = x < pick ? x / pick : (1 - x) / (1 - pick);
      ex[i] = shape + 0.12 * (Math.random() * 2 - 1);
      mean += ex[i];
    }
    mean /= n;
    let peak = 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += (1 - (o.softness || 0.35)) * (ex[i] - mean - s);
      ex[i] = s;
      peak = Math.max(peak, Math.abs(s));
    }
    const level = (o.level || 0.5) / (peak || 1);
    for (let i = 0; i < n; i++) ex[i] *= level;
    this.ex = ex;
    this.exAt = 0;
    // How much of the pickup's output is the string's speed rather than its
    // place: a magnetic pickup hears speed, which is brighter.
    this.speed = o.speed === undefined ? 0.5 : o.speed;
    this.speedScale = n / (2 * Math.PI);
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0];
    const len = out.length;
    if (currentTime >= this.stopAt) return false;
    let first = 0;
    if (currentTime + len / sampleRate <= this.startAt) {
      out.fill(0);
      return true;
    }
    if (currentTime < this.startAt) {
      first = Math.round((this.startAt - currentTime) * sampleRate);
      out.fill(0, 0, first);
    }

    // A string is a touch sharp just after the pick lets it go.
    const sharp = 1 + 0.004 * Math.exp(-this.age / 0.035);
    const f = params.frequency[0] * Math.pow(2, params.detune[0] / 1200) * sharp;
    const w0 = (2 * Math.PI * f) / sampleRate;
    // The loop lowpass: closed further for low strings, which ring with more
    // harmonics in the same bandwidth, so the top dies at a similar rate.
    const a = Math.min(0.4, Math.max(0.03, (0.35 * 110) / f));
    const phase = Math.atan2(a * Math.sin(w0), 1 - a * Math.cos(w0)) / w0;
    const gainAtF = (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w0) + a * a);
    const loss = Math.pow(10, -3 / (params.decay[0] * f)) / gainAtF;
    const target = Math.min(SIZE - 4, Math.max(2, sampleRate / f - phase));
    const from = this.d || target;
    const buf = this.buf;

    for (let i = first; i < len; i++) {
      const d = from + ((target - from) * (i - first + 1)) / (len - first);
      // Read d samples back, between samples by a four-point Hermite curve.
      let r = this.w - d;
      if (r < 0) r += SIZE;
      const i1 = Math.floor(r);
      const t = r - i1;
      const y0 = buf[(i1 - 1 + SIZE) % SIZE];
      const y1 = buf[i1];
      const y2 = buf[(i1 + 1) % SIZE];
      const y3 = buf[(i1 + 2) % SIZE];
      const c1 = 0.5 * (y2 - y0);
      const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
      const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
      const x = ((c3 * t + c2) * t + c1) * t + y1;

      this.lp = (1 - a) * x + a * this.lp;
      let v = this.lp * loss;
      if (this.exAt < this.ex.length) v += this.ex[this.exAt++];
      buf[this.w] = v;
      this.w = (this.w + 1) % SIZE;

      const o = x + this.speed * (x - this.prev) * this.speedScale;
      this.prev = x;
      // Block what is left of the pluck's offset.
      this.dcOut = o - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = o;
      out[i] = this.dcOut;
    }
    this.d = target;
    this.age += (len - first) / sampleRate;
    return true;
  }
}

registerProcessor('fretron-string', FretronString);
`;
