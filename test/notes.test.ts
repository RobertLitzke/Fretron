import { describe, expect, it } from 'vitest';
import { allCells, cellMidi, cellsOfPc, pc, pcName, STANDARD_TUNING as T, stringName } from '../src/core/music';
import { makeHuntPrompt, promptName, Sweep, type HuntPrompt } from '../src/core/notes';
import { Rng } from '../src/core/rng';

describe('the neck', () => {
  it('has 132 frets to play in standard tuning', () => {
    expect(allCells(T).length).toBe(132);
  });

  it('knows where the notes are', () => {
    expect(pcName(cellMidi(T, { string: 0, fret: 1 }), 'sharp')).toBe('F');
    expect(pcName(cellMidi(T, { string: 3, fret: 7 }), 'sharp')).toBe('D');
    expect(pcName(cellMidi(T, { string: 4, fret: 2 }), 'sharp')).toBe('C♯');
    expect(pcName(cellMidi(T, { string: 4, fret: 2 }), 'flat')).toBe('D♭');
    // F: twice on each of the six strings.
    expect(cellsOfPc(T, 5).length).toBe(12);
  });

  it('tells the two E strings apart', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => stringName(T, s))).toEqual(['low E', 'A', 'D', 'G', 'B', 'high E']);
  });
});

describe('Speed Hunter', () => {
  it('asks by name for a note that is in the window, and accepts every place it is', () => {
    const rng = new Rng(1);
    let previous: HuntPrompt | null = null;
    for (let i = 0; i < 200; i++) {
      const p = makeHuntPrompt(rng, T, 'name', 5, 11, 'mixed', previous);
      expect(p.answers.length).toBeGreaterThan(0);
      for (const a of p.answers) {
        expect(a.fret).toBeGreaterThanOrEqual(5);
        expect(a.fret).toBeLessThanOrEqual(11);
        expect(pc(cellMidi(T, a))).toBe(p.pitchClass);
      }
      expect(p.answers.length).toBe(cellsOfPc(T, p.pitchClass, 5, 11).length);
      expect(pc(p.midi)).toBe(p.pitchClass);
      if (previous) expect(p.pitchClass).not.toBe(previous.pitchClass);
      previous = p;
    }
  });

  it('asks by ear for one fret on one string, and sounds that very pitch', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 100; i++) {
      const p = makeHuntPrompt(rng, T, 'ear', 1, 7, 'sharp', null);
      expect(p.answers.length).toBe(1);
      expect(p.string).toBe(p.answers[0].string);
      expect(p.midi).toBe(cellMidi(T, p.answers[0]));
    }
  });

  it('in the advanced game pins the note to a string or to a fret, and asks for both kinds', () => {
    const rng = new Rng(9);
    let byString = 0;
    let byFret = 0;
    let previous: HuntPrompt | null = null;
    for (let i = 0; i < 300; i++) {
      const p = makeHuntPrompt(rng, T, 'advanced', 0, 12, 'mixed', previous);
      // One or the other, never both and never neither.
      expect((p.string === null) !== (p.fret === null)).toBe(true);
      expect(p.answers.length).toBeGreaterThan(0);
      for (const a of p.answers) expect(pc(cellMidi(T, a))).toBe(p.pitchClass);
      if (p.string !== null) {
        byString++;
        // Everywhere the note is on that string: once, or twice where the open string and fret 12 are both in play.
        expect(p.answers).toEqual(cellsOfPc(T, p.pitchClass, 0, 12).filter((c) => c.string === p.string));
        expect(p.answers.length).toBeLessThanOrEqual(2);
      } else {
        byFret++;
        expect(p.fret).toBeGreaterThan(0);
        expect(p.answers).toEqual(cellsOfPc(T, p.pitchClass, 0, 12).filter((c) => c.fret === p.fret));
      }
      previous = p;
    }
    expect(byString).toBeGreaterThan(60);
    expect(byFret).toBeGreaterThan(60);
  });

  it('counts the open strings when the window starts at the nut', () => {
    const rng = new Rng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const p = makeHuntPrompt(rng, T, 'ear', 0, 12, 'sharp', null);
      seen.add(p.answers[0].fret);
    }
    expect(seen.has(0)).toBe(true);
    // E by name: both E strings open, and at fret 12, among the rest.
    const e = cellsOfPc(T, 4, 0, 12);
    expect(e.filter((c) => c.fret === 0).length).toBe(2);
  });

  it('spells as the player asked', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 50; i++) {
      expect(promptName(rng, 1, 'sharp')).toBe('C♯');
      expect(promptName(rng, 1, 'flat')).toBe('D♭');
      expect(promptName(rng, 4, 'flat')).toBe('E');
    }
    const mixed = new Set(Array.from({ length: 60 }, () => promptName(rng, 1, 'mixed')));
    expect(mixed).toEqual(new Set(['C♯', 'D♭']));
  });
});

describe('Fret Sweeper', () => {
  it('clears the whole board by calling each note once', () => {
    const sweep = new Sweep(new Rng(7), T, 1, 22);
    expect(sweep.total).toBe(132);
    expect(sweep.order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    let calls = 0;
    while (!sweep.done) {
      calls++;
      const target = sweep.target;
      const cells = cellsOfPc(T, target);
      expect(sweep.left).toBe(cells.length);
      cells.forEach((cell, i) => {
        const result = sweep.tap(cell);
        if (i < cells.length - 1) expect(result).toBe('hit');
        else expect(['next-call', 'board-cleared']).toContain(result);
      });
    }
    expect(calls).toBe(12);
    expect(sweep.cleared).toBe(132);
    expect(sweep.mistakes).toBe(0);
  });

  it('counts a wrong fret as a mistake and leaves it in play', () => {
    const sweep = new Sweep(new Rng(7), T, 1, 22);
    const wrong = allCells(T).find((c) => pc(cellMidi(T, c)) !== sweep.target)!;
    expect(sweep.tap(wrong)).toBe('miss');
    expect(sweep.mistakes).toBe(1);
    expect(sweep.isDead(wrong)).toBe(false);
    expect(sweep.cleared).toBe(0);
  });

  it('clears a twelve-fret neck too: 72 frets, six of each note', () => {
    const sweep = new Sweep(new Rng(3), T, 1, 12);
    expect(sweep.total).toBe(72);
    expect(sweep.order.length).toBe(12);
    expect(sweep.left).toBe(6);
  });

  it('ignores a fret that is already cleared', () => {
    const sweep = new Sweep(new Rng(7), T, 1, 22);
    const cell = cellsOfPc(T, sweep.target)[0];
    expect(sweep.tap(cell)).toBe('hit');
    expect(sweep.tap(cell)).toBe('dead');
    expect(sweep.mistakes).toBe(0);
  });
});

describe('Fret Sweeper at random', () => {
  it('calls once for every fret, and never the same note twice running', () => {
    for (const last of [12, 15, 22]) {
      for (let seed = 1; seed <= 40; seed++) {
        const sweep = new Sweep(new Rng(seed), T, 1, last, 'random');
        expect(sweep.order.length).toBe(sweep.total);
        for (let p = 0; p < 12; p++) {
          expect(sweep.order.filter((o) => o === p).length).toBe(cellsOfPc(T, p, 1, last).length);
        }
        for (let i = 1; i < sweep.order.length; i++) expect(sweep.order[i]).not.toBe(sweep.order[i - 1]);
      }
    }
  });

  it('moves to the next call after one fret, and always has a fret left to answer it', () => {
    const rng = new Rng(11);
    const sweep = new Sweep(new Rng(5), T, 1, 12, 'random');
    let calls = 0;
    while (!sweep.done) {
      calls++;
      const live = cellsOfPc(T, sweep.target, 1, 12).filter((c) => !sweep.isDead(c));
      expect(live.length).toBe(sweep.left);
      expect(live.length).toBeGreaterThan(0);
      expect(sweep.tap(rng.pick(live))).toBe(calls < 72 ? 'next-call' : 'board-cleared');
    }
    expect(calls).toBe(72);
    expect(sweep.cleared).toBe(72);
  });

  it('takes a wrong fret as a mistake without moving on', () => {
    const sweep = new Sweep(new Rng(2), T, 1, 12, 'random');
    const target = sweep.target;
    const wrong = allCells(T, 1, 12).find((c) => pc(cellMidi(T, c)) !== target)!;
    expect(sweep.tap(wrong)).toBe('miss');
    expect(sweep.target).toBe(target);
    expect(sweep.mistakes).toBe(1);
  });

  it('copes with a board where one note is most of what there is', () => {
    // One string over one fret: a single call.
    expect(new Sweep(new Rng(1), { name: 'one', open: [40] }, 1, 1, 'random').order).toEqual([5]);
    // Two strings an octave apart: the same note twice, and no other to put between.
    const twins = new Sweep(new Rng(1), { name: 'twins', open: [40, 52] }, 1, 1, 'random');
    expect(twins.order).toEqual([5, 5]);
  });
});
