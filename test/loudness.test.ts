import { describe, expect, it } from 'vitest';
import { loudnessGain } from '../src/audio/loudness';

describe('loudnessGain', () => {
  it('leaves the open top string alone', () => {
    expect(loudnessGain('synth', 64)).toBeCloseTo(1);
    expect(loudnessGain('guitar', 64)).toBeCloseTo(1);
  });

  it('raises low notes and lowers high ones', () => {
    expect(loudnessGain('synth', 40)).toBeGreaterThan(2);
    expect(loudnessGain('synth', 88)).toBeLessThan(1);
    for (let m = 40; m < 88; m++) expect(loudnessGain('synth', m)).toBeGreaterThanOrEqual(loudnessGain('synth', m + 1));
  });

  it('stays within limits, past the measured pitches too', () => {
    for (const voice of ['synth', 'guitar'] as const) {
      for (let m = 20; m <= 110; m++) {
        const g = loudnessGain(voice, m);
        expect(g).toBeLessThanOrEqual(10 ** (8 / 20) + 1e-9);
        expect(g).toBeGreaterThanOrEqual(10 ** (-4 / 20) - 1e-9);
      }
    }
  });
});
