import { describe, expect, it } from 'vitest';
import { cellMidi, pc, STANDARD_TUNING as T, type Cell } from '../src/core/music';
import { Rng } from '../src/core/rng';
import {
  checkVoicing,
  chordName,
  chordTones,
  closestToTarget,
  COMPACT_BONUS,
  compactPoints,
  COMPACT_STEP,
  displacement,
  enumerateVoicings,
  keepers,
  likeliest,
  makeProgression,
  makeTarget,
  motionBonus,
  motionOf,
  nearestVoicing,
  TARGET_BONUS,
  TARGET_STEP,
  targetDistance,
  targetPoints,
  tightestSpread,
  spreadOf,
  timePoints,
  toneLabel,
  voicingKey,
  type Chord,
} from '../src/core/triads';

const cells = (...pairs: [number, number][]): Cell[] => pairs.map(([string, fret]) => ({ string, fret }));
const voicingKeyOf = (cell: Cell) => `${cell.string}:${cell.fret}`;

const C: Chord = { root: 0, quality: 'maj' };
const Dm: Chord = { root: 2, quality: 'min' };
const G: Chord = { root: 7, quality: 'maj' };
const Bdim: Chord = { root: 11, quality: 'dim' };

describe('checking a voicing', () => {
  it('accepts the three inversions of C major on the top three strings', () => {
    // G B E strings: C/E/G shapes guitarists know.
    expect(checkVoicing(T, cells([3, 5], [4, 5], [5, 3]), C)).toMatchObject({ ok: true, inversion: 'Root', labels: ['R', '3', '5'] });
    expect(checkVoicing(T, cells([3, 9], [4, 8], [5, 8]), C)).toMatchObject({ ok: true, inversion: '1st', labels: ['3', '5', 'R'] });
    expect(checkVoicing(T, cells([3, 12], [4, 13], [5, 12]), C)).toMatchObject({ ok: true, inversion: '2nd', labels: ['5', 'R', '3'] });
  });

  it('does not care what order the cells were tapped in', () => {
    expect(checkVoicing(T, cells([5, 3], [3, 5], [4, 5]), C).ok).toBe(true);
  });

  it('labels minor and diminished chord tones', () => {
    expect(checkVoicing(T, cells([3, 7], [4, 6], [5, 5]), Dm)).toMatchObject({ ok: true, inversion: 'Root', labels: ['R', 'b3', '5'] });
    expect(checkVoicing(T, cells([3, 4], [4, 3], [5, 1]), Bdim)).toMatchObject({ ok: true, inversion: 'Root', labels: ['R', 'b3', 'd5'] });
  });

  it('rejects wrong notes, doubled notes, and strings that are not neighbours', () => {
    expect(checkVoicing(T, cells([3, 5], [4, 5], [5, 4]), C).ok).toBe(false);
    expect(checkVoicing(T, cells([3, 5], [4, 1], [5, 8]), C).ok).toBe(false); // C C C
    expect(checkVoicing(T, cells([2, 10], [4, 5], [5, 3]), C)).toMatchObject({ ok: false, reason: 'Use three neighbouring strings' });
    expect(checkVoicing(T, cells([3, 5], [4, 5]), C)).toMatchObject({ ok: false, reason: 'Pick three notes' });
  });

  it('rejects the right notes spread wider than an octave', () => {
    // G string fret 5 (C), B string fret 5 (E), high E fret 15 (G, an octave up).
    expect(checkVoicing(T, cells([3, 5], [4, 5], [5, 15]), C)).toMatchObject({ ok: false, reason: 'Not a close voicing' });
  });
});

describe('listing voicings', () => {
  it('finds only real voicings, with no repeats, on all four string sets', () => {
    for (const chord of [C, Dm, G, Bdim]) {
      const all = enumerateVoicings(T, chord);
      expect(new Set(all.map(voicingKey)).size).toBe(all.length);
      expect(new Set(all.map((v) => v[0].string))).toEqual(new Set([0, 1, 2, 3]));
      for (const v of all) {
        expect(checkVoicing(T, v, chord).ok).toBe(true);
        expect(new Set(v.map((c) => pc(cellMidi(T, c))))).toEqual(new Set(chordTones(chord)));
      }
    }
  });

  it('finds every inversion on each string set, once or twice along 22 frets', () => {
    const all = enumerateVoicings(T, C);
    for (let low = 0; low < 4; low++) {
      const onSet = all.filter((v) => v[0].string === low);
      const inversions = onSet.map((v) => checkVoicing(T, v, C).inversion);
      expect(new Set(inversions)).toEqual(new Set(['Root', '1st', '2nd']));
      expect(onSet.length).toBeGreaterThanOrEqual(4);
      expect(onSet.length).toBeLessThanOrEqual(6);
    }
  });

  it('includes the shapes a player would try', () => {
    const keys = new Set(enumerateVoicings(T, C).map(voicingKey));
    expect(keys.has(voicingKey(cells([3, 5], [4, 5], [5, 3])))).toBe(true);
    expect(keys.has(voicingKey(cells([0, 8], [1, 7], [2, 5])))).toBe(true);
  });
});

describe('open strings', () => {
  const Em: Chord = { root: 4, quality: 'min' };

  it('are part of a voicing when the neck starts at fret 0', () => {
    // G B E open is E minor; D G B open is G major; A string 3, D string 2, G open is C major.
    expect(checkVoicing(T, cells([3, 0], [4, 0], [5, 0]), Em)).toMatchObject({ ok: true, inversion: '1st', labels: ['b3', '5', 'R'] });
    const keysOf = (chord: Chord, first: number) => new Set(enumerateVoicings(T, chord, first, 12).map(voicingKey));
    expect(keysOf(Em, 0).has(voicingKey(cells([3, 0], [4, 0], [5, 0])))).toBe(true);
    expect(keysOf(G, 0).has(voicingKey(cells([2, 0], [3, 0], [4, 0])))).toBe(true);
    expect(keysOf(C, 0).has(voicingKey(cells([1, 3], [2, 2], [3, 0])))).toBe(true);
    expect(keysOf(Em, 1).has(voicingKey(cells([3, 0], [4, 0], [5, 0])))).toBe(false);
  });

  it('add to the fretted voicings and take none away', () => {
    for (const chord of [C, Dm, G, Bdim, Em]) {
      const fretted = enumerateVoicings(T, chord, 1, 12);
      const withOpen = enumerateVoicings(T, chord, 0, 12);
      const keys = new Set(withOpen.map(voicingKey));
      for (const v of fretted) expect(keys.has(voicingKey(v))).toBe(true);
      for (const v of withOpen) {
        expect(checkVoicing(T, v, chord).ok).toBe(true);
        // No shape asks for more than a four-fret stretch between the fingers.
        const held = v.map((c) => c.fret).filter((f) => f > 0);
        if (held.length) expect(Math.max(...held) - Math.min(...held)).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('a wrong guess', () => {
  const all = enumerateVoicings(T, C, 0, 12);

  it('keeps the notes it shares with a real voicing', () => {
    // C and E right on the G and B strings; the top note wrong.
    expect(keepers(cells([3, 5], [4, 5], [5, 4]), all).map(voicingKeyOf)).toEqual(['3:5', '4:5']);
    // Nothing right.
    expect(keepers(cells([3, 6], [4, 6], [5, 6]), all)).toEqual([]);
  });

  it('does not keep two of the same chord tone, or right notes that cannot be one shape', () => {
    // C on the G string, C on the B string, C on the high E: all chord tones, one voicing at most each.
    const roots = keepers(cells([3, 5], [4, 1], [5, 8]), all);
    expect(roots.length).toBe(1);
    // C E G, but the G an octave up: two of the three can stay.
    expect(keepers(cells([3, 5], [4, 5], [5, 15]), enumerateVoicings(T, C, 0, 22)).map(voicingKeyOf)).toEqual(['3:5', '4:5']);
  });

  it('names what a note is to the chord', () => {
    expect(toneLabel(Dm, 2)).toBe('R');
    expect(toneLabel(Dm, 5)).toBe('b3');
    expect(toneLabel(Dm, 9)).toBe('5');
    expect(toneLabel(Bdim, 5)).toBe('d5');
    expect(toneLabel(Dm, 0)).toBeNull();
  });

  it('finds the voicing nearest a shape', () => {
    const from = cells([3, 5], [4, 6], [5, 5]);
    const near = nearestVoicing(all, from)!;
    for (const v of all) expect(displacement(from, near)).toBeLessThanOrEqual(displacement(from, v));
    expect(nearestVoicing(all, null)).toBe(all[0]);
    expect(nearestVoicing([], from)).toBeNull();
  });

  it('is answered with the voicing it was nearest to being', () => {
    // Two right notes on the low strings and a wrong third: the answer finishes that shape,
    // and does not jump to a nearer-looking one on other strings.
    const guess = cells([0, 8], [1, 7], [2, 9]);
    expect(voicingKey(likeliest(guess, all, guess)!)).toBe(voicingKey(cells([0, 8], [1, 7], [2, 5])));
    // Nothing right: the nearest to where the hand was.
    const lost = cells([3, 6], [4, 6], [5, 6]);
    expect(likeliest(lost, all, lost)).toBe(nearestVoicing(all, lost));
  });
});

describe('voice leading', () => {
  it('measures the mean fret movement of the three voices', () => {
    const dm = cells([3, 7], [4, 6], [5, 5]);
    const g = cells([3, 7], [4, 8], [5, 7]);
    expect(displacement(dm, g)).toBeCloseTo((0 + 2 + 2) / 3);
    expect(displacement(dm, dm)).toBe(0);
  });

  it('matches voices low to low even across string sets', () => {
    expect(displacement(cells([3, 5], [4, 5], [5, 3]), cells([2, 5], [1, 7], [0, 8]))).toBeCloseTo((3 + 2 + 2) / 3);
  });

  it('grades the movement as the design document does', () => {
    expect(motionOf(2)).toBe('smooth');
    expect(motionOf(2.01)).toBe('moderate');
    expect(motionOf(4)).toBe('moderate');
    expect(motionOf(4.34)).toBe('leap');
    expect(motionBonus('smooth')).toBe(500);
    expect(motionBonus('moderate')).toBe(200);
    expect(motionBonus('leap')).toBe(0);
  });

  it('pays less the longer a chord takes, but never nothing: there is no time limit', () => {
    expect(timePoints(0)).toBe(1000);
    expect(timePoints(4)).toBe(500);
    expect(timePoints(12)).toBe(250);
    expect(timePoints(60)).toBeGreaterThan(0);
    expect(timePoints(2)).toBeGreaterThan(timePoints(3));
  });
});

describe('progressions', () => {
  it('names chords in the key, and every chord can be played', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 200; i++) {
      const p = makeProgression(rng);
      expect(p.chords.length).toBe(p.roman.length);
      expect(p.chords.length).toBeGreaterThanOrEqual(2);
      for (const chord of p.chords) {
        expect(chordName(chord, p.spelling)).toMatch(/^[A-G][♯♭]?(m|°)?$/);
        expect(enumerateVoicings(T, chord, 1, 12).length).toBeGreaterThan(0);
      }
    }
  });

  it('spells flat keys in flats', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 300; i++) {
      const p = makeProgression(rng);
      if (p.keyName === 'F major') expect(p.spelling).toBe('flat');
      if (p.keyName === 'G major') expect(p.spelling).toBe('sharp');
      expect(p.keyName.includes('♯') && p.spelling === 'flat').toBe(false);
    }
  });
});

describe('targets', () => {
  const shape = cells([3, 5], [4, 5], [5, 3]); // C on the top three strings, 5th fret

  it('measures to the nearest note of the chord', () => {
    expect(targetDistance({ string: null, fret: 5 }, shape)).toBe(0);
    expect(targetDistance({ string: null, fret: 9 }, shape)).toBe(4);
    expect(targetDistance({ string: 1, fret: null }, shape)).toBe(2);
    expect(targetDistance({ string: 5, fret: null }, shape)).toBe(0);
    // Both: frets and strings added, from whichever note is nearest.
    expect(targetDistance({ string: 2, fret: 4 }, shape)).toBe(2);
    expect(targetDistance({ string: 5, fret: 3 }, shape)).toBe(0);
  });

  it('knows how near the chord can get', () => {
    const all = enumerateVoicings(T, C, 0, 12);
    expect(closestToTarget({ string: null, fret: 5 }, all)).toBe(0);
    for (let s = 0; s < 6; s++) expect(closestToTarget({ string: s, fret: null }, all)).toBe(0);
  });

  it('takes points off for each step further out than needed', () => {
    expect(targetPoints(0)).toBe(TARGET_BONUS);
    expect(targetPoints(1)).toBe(TARGET_BONUS - TARGET_STEP);
    expect(targetPoints(4)).toBeLessThan(0);
  });

  it('lights a fret, a string or both, within the frets given', () => {
    const rng = new Rng(7);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = makeTarget(rng, 6, 3, 9);
      expect(t.string !== null || t.fret !== null).toBe(true);
      if (t.fret !== null) expect(t.fret >= 3 && t.fret <= 9).toBe(true);
      if (t.string !== null) expect(t.string >= 0 && t.string < 6).toBe(true);
      kinds.add(`${t.string === null}${t.fret === null}`);
    }
    expect(kinds.size).toBe(3);
  });
});

describe('compactness', () => {
  it('spreads across held frets only', () => {
    expect(spreadOf([cells([3, 5], [4, 5], [5, 3]), cells([3, 7], [4, 8], [5, 7])])).toBe(5);
    expect(spreadOf([cells([3, 0], [4, 1], [5, 0])])).toBe(0);
  });

  it('finds the tightest a progression can be held', () => {
    const choices = [C, Dm, G].map((ch) => enumerateVoicings(T, ch, 0, 12));
    const tight = tightestSpread(choices);
    // Brute force over every combination agrees.
    let best = Infinity;
    for (const a of choices[0]) for (const b of choices[1]) for (const c of choices[2]) best = Math.min(best, spreadOf([a, b, c]));
    expect(tight).toBe(best);
  });

  it('pays per chord, less for each fret wider than needed', () => {
    expect(compactPoints(0, 4)).toBe(4 * COMPACT_BONUS);
    expect(compactPoints(1, 3)).toBe(3 * (COMPACT_BONUS - COMPACT_STEP));
    expect(compactPoints(99, 3)).toBe(0);
  });
});
