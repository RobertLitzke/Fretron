import { describe, expect, it } from 'vitest';
import {
  BEND_PROMPTS,
  BEND_TIERS,
  bendLabel,
  centsFromDrag,
  contourAt,
  contourDuration,
  contourPeak,
  dragForCents,
  gradeBend,
  gradeTrace,
  makeBendPrompt,
  makeContour,
  makePhrase,
  buildContour,
  contourWords,
  INSTANT,
  MAX_TRACE_BEATS,
  MOVE_BEATS,
  phraseBeats,
  TRACE_BPM,
  makeTracePrompt,
  MAX_BEND_CENTS,
  positionTravel,
  scoreGrade,
  semitoneTravel,
  traceError,
  type Contour,
  type TraceSample,
} from '../src/core/bend';
import { centsOff, midiToHz, STANDARD_TUNING as T } from '../src/core/music';
import { Rng } from '../src/core/rng';
import { NO_STREAK } from '../src/core/streak';

describe('a single bend', () => {
  it('writes bends in whole steps', () => {
    expect([0, 1, 2, 3, 4].map(bendLabel)).toEqual(['0', '½', '1', '1½', '2']);
  });

  it('bends the same either way across the neck, and stops at the limit', () => {
    expect(centsFromDrag(-30, 40)).toBeCloseTo(centsFromDrag(30, 40));
    expect(centsFromDrag(40, 40)).toBeCloseTo(100);
    expect(centsFromDrag(0, 40)).toBe(0);
    expect(centsFromDrag(5000, 40)).toBe(MAX_BEND_CENTS);
    expect(centsFromDrag(dragForCents(250, 37), 37)).toBeCloseTo(250);
  });

  it('needs a longer push toward the middle of the string', () => {
    expect(positionTravel(12)).toBeCloseTo(1);
    expect(positionTravel(5)).toBeLessThan(positionTravel(9));
    expect(positionTravel(9)).toBeLessThan(positionTravel(12));
    expect(positionTravel(5)).toBeCloseTo(0.867, 2);
  });

  it('gives each string its own travel, and no two prompts quite the same', () => {
    const mean = (string: number, fret: number) => {
      const rng = new Rng(string * 100 + fret);
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += semitoneTravel(rng, T, { string, fret });
      return sum / 400;
    };
    // The plain G gives the most pitch for the least push; the high E takes more.
    expect(mean(3, 9)).toBeLessThan(mean(4, 9));
    expect(mean(4, 9)).toBeLessThan(mean(5, 9));
    expect(mean(2, 9)).toBeGreaterThan(mean(3, 9));
    const rng = new Rng(6);
    const draws = Array.from({ length: 200 }, () => semitoneTravel(rng, T, { string: 4, fret: 9 }));
    const middle = 0.85 * 1.0 * positionTravel(9);
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(middle * 0.9 - 1e-9);
    expect(Math.max(...draws)).toBeLessThanOrEqual(middle * 1.1 + 1e-9);
    expect(Math.max(...draws) - Math.min(...draws)).toBeGreaterThan(middle * 0.15);
  });

  it('leaves room on a phone for the widest bend it can ask for', () => {
    // Two whole steps on the G string at fret 12, at the long end of the random part.
    const widest = 0.85 * 0.9 * 1 * 1.1 * 4;
    // From the G string down to the foot of the board is three and a half gaps.
    expect(widest).toBeLessThan(3.5);
  });

  it('agrees with the document on what a cent is', () => {
    expect(centsOff(midiToHz(62), midiToHz(60))).toBeCloseTo(200);
    expect(centsOff(midiToHz(60) * 2 ** (7 / 1200), midiToHz(60))).toBeCloseTo(7);
  });

  it('grades by distance from the target, sharp or flat', () => {
    expect(gradeBend(0)).toBe('bullseye');
    expect(gradeBend(-5)).toBe('bullseye');
    expect(gradeBend(6)).toBe('intune');
    expect(gradeBend(-15)).toBe('intune');
    expect(gradeBend(16)).toBe('acceptable');
    expect(gradeBend(30)).toBe('acceptable');
    expect(gradeBend(-31)).toBe('off');
  });

  it('scores a bend at the multiplier it found, then steps it a quarter for green, a tenth for tan, and drops it on a miss', () => {
    expect(scoreGrade('bullseye', NO_STREAK)).toEqual({ points: 4700, streak: { run: 1, mult: 1.25 } });
    expect(scoreGrade('intune', { run: 2, mult: 1.5 })).toEqual({ points: 5250, streak: { run: 3, mult: 1.75 } });
    expect(scoreGrade('acceptable', { run: 2, mult: 1.5 })).toEqual({ points: 2400, streak: { run: 3, mult: 1.6 } });
    expect(scoreGrade('off', { run: 5, mult: 2.25 })).toEqual({ points: 0, streak: NO_STREAK });
  });

  it('comes to about 100,000 for a run of bullseyes', () => {
    let streak = NO_STREAK;
    let total = 0;
    for (let i = 0; i < BEND_PROMPTS; i++) {
      const s = scoreGrade('bullseye', streak);
      total += s.points;
      streak = s.streak;
    }
    expect(total).toBeGreaterThan(95_000);
    expect(total).toBeLessThan(105_000);
  });

  it('asks only for the bends its tier allows, on the neck where bends are played', () => {
    const allowed = { standard: [1, 2], advanced: [1, 2, 3], virtuoso: [1, 2, 3, 4] };
    const rng = new Rng(5);
    for (const tier of BEND_TIERS) {
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) {
        const p = makeBendPrompt(rng, T, tier, 22);
        seen.add(p.semis);
        expect(p.to - p.from).toBe(p.semis);
        expect(p.cell.fret).toBeGreaterThanOrEqual(5);
        expect(p.cell.fret).toBeLessThanOrEqual(17);
        if (p.semis >= 3) expect(p.cell.string).toBeGreaterThanOrEqual(3);
      }
      expect([...seen].sort()).toEqual(allowed[tier]);
    }
  });

  it('keeps to the neck it is given', () => {
    const rng = new Rng(12);
    for (let i = 0; i < 300; i++) {
      const p = makeBendPrompt(rng, T, 'virtuoso', 12);
      expect(p.cell.fret).toBeGreaterThanOrEqual(5);
      expect(p.cell.fret).toBeLessThanOrEqual(12);
      expect(p.travel).toBeGreaterThan(0.5);
      expect(p.travel).toBeLessThan(1.1);
    }
  });
});

const halfThenWhole: Contour = {
  stops: [1, 2],
  points: [
    { t: 0, cents: 0 },
    { t: 0.5, cents: 0 },
    { t: 1, cents: 100 },
    { t: 2, cents: 100 },
    { t: 2.5, cents: 200 },
    { t: 3.5, cents: 200 },
  ],
};

/** A finger that follows the contour, shifted in time and pitch. */
function follow(contour: Contour, late = 0, sharp = 0): TraceSample[] {
  const out: TraceSample[] = [];
  for (let t = 0; t <= contourDuration(contour); t += 0.01) out.push({ t, cents: Math.max(0, contourAt(contour, t - late) + sharp) });
  return out;
}

describe('a bend over time', () => {
  it('reads a contour between its points', () => {
    expect(contourAt(halfThenWhole, 0.25)).toBe(0);
    expect(contourAt(halfThenWhole, 0.75)).toBeCloseTo(50);
    expect(contourAt(halfThenWhole, 1.5)).toBe(100);
    expect(contourAt(halfThenWhole, 9)).toBe(200);
    expect(contourDuration(halfThenWhole)).toBe(3.5);
    expect(contourPeak(halfThenWhole)).toBe(200);
  });

  it('scores a perfect trace as no error', () => {
    expect(traceError(halfThenWhole, follow(halfThenWhole))).toBeLessThan(1.5);
  });

  it('forgives a tenth of a second of lateness but not half a second', () => {
    expect(traceError(halfThenWhole, follow(halfThenWhole, 0.1))).toBeLessThan(3);
    expect(traceError(halfThenWhole, follow(halfThenWhole, 0.5))).toBeGreaterThan(12);
  });

  it('charges a steady pitch error wherever the prompt is holding still', () => {
    // 25 cents sharp throughout. On the two moving stretches (1 s of 3.5) the
    // slack hides it; on the held stretches it counts in full.
    const error = traceError(halfThenWhole, follow(halfThenWhole, 0, 25));
    expect(error).toBeGreaterThan(16);
    expect(error).toBeLessThan(25);
  });

  it('counts an untouched string, and time after letting go, as unbent', () => {
    const untouched = traceError(halfThenWhole, []);
    expect(untouched).toBeGreaterThan(90);
    const letGo = follow(halfThenWhole).filter((s) => s.t < 2);
    letGo.push({ t: 2, cents: 0 });
    const early = traceError(halfThenWhole, letGo);
    expect(early).toBeGreaterThan(40);
    expect(early).toBeLessThan(untouched);
  });

  it('holds the last pitch between samples', () => {
    // Two samples: silent, then straight to the half step and nothing more.
    const sparse = [{ t: 0, cents: 0 }, { t: 1, cents: 100 }];
    const error = traceError({ stops: [1], points: [{ t: 0, cents: 0 }, { t: 1, cents: 0 }, { t: 1, cents: 100 }, { t: 3, cents: 100 }] }, sparse);
    expect(error).toBeLessThan(1);
  });

  it('grades more gently than a single bend', () => {
    expect(gradeTrace(9)).toBe('bullseye');
    expect(gradeTrace(20)).toBe('intune');
    expect(gradeTrace(35)).toBe('acceptable');
    expect(gradeTrace(60)).toBe('off');
  });

  it('builds phrases on a half-beat grid, 1 to 4 beats a move, that fit in two bars', () => {
    const rng = new Rng(9);
    for (const tier of BEND_TIERS) {
      for (let i = 0; i < 300; i++) {
        const phrase = makePhrase(rng, tier);
        expect([0, 0.5, 1]).toContain(phrase.lead);
        expect(phraseBeats(phrase)).toBeLessThanOrEqual(MAX_TRACE_BEATS);
        for (const m of phrase.moves) {
          expect(MOVE_BEATS as readonly number[]).toContain(m.beats);
          // Every pitch is held at least half a beat once it is reached.
          expect(m.beats - m.rise).toBeGreaterThanOrEqual(0.5);
        }
        expect(phrase.moves.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('builds contours that run forward in time, start unbent unless pre-bent, and land each move on its beat', () => {
    const rng = new Rng(4);
    for (const tier of BEND_TIERS) {
      const bpm = TRACE_BPM[tier];
      const beat = 60 / bpm;
      for (let i = 0; i < 300; i++) {
        const phrase = makePhrase(rng, tier);
        const c = buildContour(phrase, bpm);
        expect(c.points[0].cents).toBe(phrase.pre ? phrase.moves[0].to * 100 : 0);
        for (let k = 1; k < c.points.length; k++) expect(c.points[k].t).toBeGreaterThan(c.points[k - 1].t);
        expect(contourDuration(c)).toBeCloseTo(phraseBeats(phrase) * beat, 2);
        expect(contourPeak(c)).toBeLessThanOrEqual(tier === 'standard' ? 200 : tier === 'advanced' ? 300 : 400);
        // Each move's pitch is there by the end of its rise and held to the next move's start.
        let t = phrase.lead * beat;
        phrase.moves.forEach((m, k) => {
          const landed = k === 0 && phrase.pre ? 0 : Math.max(INSTANT, m.rise * beat);
          if (!m.vibrato) expect(contourAt(c, t + landed + 0.01)).toBeCloseTo(m.to * 100, 0);
          t += m.beats * beat;
          expect(contourAt(c, t - 0.001)).toBeCloseTo(m.to * 100, -1);
        });
      }
    }
  });

  it('asks for instant bends, pre-bends, releases and slopes of more than one kind', () => {
    const rng = new Rng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const phrase = makePhrase(rng, 'advanced');
      if (phrase.pre) seen.add('pre');
      for (const m of phrase.moves) {
        if (m.rise === 0) seen.add('instant');
        if (m.to === 0) seen.add('release');
        if (m.vibrato) seen.add('vibrato');
        seen.add(m.curve ?? 'even');
      }
    }
    for (const kind of ['pre', 'instant', 'release', 'vibrato', 'even', 'snap', 'swell', 'push']) expect(seen).toContain(kind);
  });

  it('names a trace the way it is played', () => {
    const rng = new Rng(1);
    const pre = buildContour({ lead: 0, pre: true, moves: [{ to: 2, beats: 2, rise: 0 }, { to: 0, beats: 2, rise: 0.5 }] }, 80);
    expect(contourWords(pre)).toBe('pre-bend 1 → release');
    expect(pre.points[0]).toEqual({ t: 0, cents: 200 });
    expect(contourWords(makeContour(rng, 'standard'))).toMatch(/→/);
  });

  it('wobbles a vibrato below the held pitch, and never above it', () => {
    const c = buildContour({ lead: 1, moves: [{ to: 2, beats: 3, rise: 0.5, curve: 'snap', vibrato: 25 }] }, 60);
    const held = c.points.filter((p) => p.t > 1.6);
    expect(Math.max(...held.map((p) => p.cents))).toBe(200);
    expect(Math.min(...held.map((p) => p.cents))).toBe(175);
  });

  it('puts wide traces on the high strings', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) {
      const p = makeTracePrompt(rng, T, 'virtuoso', 12);
      expect(p.cell.fret).toBeLessThanOrEqual(12);
      if (contourPeak(p.contour) >= 300) expect(p.cell.string).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('runs of other lengths', () => {
  it('weights a song of fewer phrases so a perfect run comes to the same', () => {
    const perfect = (prompts: number) => {
      let streak = NO_STREAK;
      let total = 0;
      for (let i = 0; i < prompts; i++) {
        const s = scoreGrade('bullseye', streak, prompts);
        total += s.points;
        streak = s.streak;
      }
      return total;
    };
    expect(Math.abs(perfect(7) - perfect(BEND_PROMPTS))).toBeLessThan(100);
    expect(Math.abs(perfect(14) - perfect(BEND_PROMPTS))).toBeLessThan(100);
  });
});
