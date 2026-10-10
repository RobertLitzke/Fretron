import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/audio/audio', () => ({ pluck: () => {} }));

import { TriadInput } from '../src/app/game/triadInput';
import type { Board, BoardTouch } from '../src/board/board';
import { STANDARD_TUNING as T, type Cell } from '../src/core/music';
import { checkVoicing, enumerateVoicings, type Chord } from '../src/core/triads';

/** Pixels between strings and along a fret, roughly a phone in landscape. */
const SPACING = 40;
const FRET = 60;

const C: Chord = { root: 0, quality: 'maj' };
const G: Chord = { root: 7, quality: 'maj' };
const Am: Chord = { root: 9, quality: 'min' };

function setup() {
  const board = { flash: () => {}, theme: { cyan: 'cyan' } } as unknown as Board;
  const handedIn: Cell[][] = [];
  const input = new TriadInput(board, T, () => {}, (cells) => handedIn.push(cells));
  input.enabled = true;
  let id = 0;

  /** A finger at string position `string` (fractional) over fret `fret`. */
  const touch = (touchId: number, string: number, fret: number): BoardTouch => {
    const nearest = Math.round(string);
    return {
      id: touchId,
      x: (fret - 0.5) * FRET,
      y: -string * SPACING,
      cell: nearest >= 0 && nearest < 6 ? { string: nearest, fret } : null,
      string,
      pos: fret - 0.5,
      time: 0,
    };
  };

  /** Tap a cell, landing `off` strings away from its line. */
  const tap = (cell: Cell, off = 0) => {
    const t = touch(++id, cell.string + off, cell.fret);
    input.down(t);
    input.up(t);
  };

  /** Drag from one string position to another, in small steps, over fret `fret`. */
  const rake = (from: number, to: number, fret = 1) => {
    const n = ++id;
    const steps = 12;
    input.down(touch(n, from, fret));
    for (let i = 1; i <= steps; i++) input.move(touch(n, from + ((to - from) * i) / steps, fret));
    input.up(touch(n, to, fret));
  };

  return { input, handedIn, tap, rake };
}

function permutations<X>(xs: readonly X[]): X[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('tap and rake', () => {
  it('hands in every voicing of a chord, whatever the tap order and rake direction', () => {
    for (const chord of [C, G, Am]) {
      for (const voicing of enumerateVoicings(T, chord, 0, 12)) {
        for (const order of permutations(voicing)) {
          for (const upward of [true, false]) {
            const { input, handedIn, tap, rake } = setup();
            order.forEach((c) => tap(c));
            const low = voicing[0].string;
            if (upward) rake(low - 0.6, low + 2.6);
            else rake(low + 2.6, low - 0.6);
            expect(handedIn).toHaveLength(1);
            expect(checkVoicing(T, handedIn[0], chord).ok).toBe(true);
            input.clear();
          }
        }
      }
    }
  });

  it('hands the chord in on any drag, wherever it is and whatever strings it crosses', () => {
    // C major on D G B, then a drag that misses those strings, crosses others, or runs along one.
    for (const [from, to, fret] of [
      [0, 1.2, 1],
      [5.2, 3.9, 12],
      [3.0, 3.5, 7],
      [0, 5, 3],
    ]) {
      const { handedIn, tap, rake } = setup();
      [{ string: 2, fret: 10 }, { string: 3, fret: 9 }, { string: 4, fret: 8 }].forEach((c) => tap(c));
      rake(from, to, fret);
      expect(handedIn, `drag ${from} → ${to} at fret ${fret}`).toHaveLength(1);
      expect(checkVoicing(T, handedIn[0], C).ok).toBe(true);
    }
  });

  it('hands nothing in until three notes are chosen, and only once a drag', () => {
    const { handedIn, tap, rake } = setup();
    tap({ string: 2, fret: 10 });
    tap({ string: 3, fret: 9 });
    rake(0, 5);
    expect(handedIn).toHaveLength(0);
    tap({ string: 4, fret: 8 });
    rake(0, 5);
    expect(handedIn).toHaveLength(1);
  });

  it('keeps the notes that fit a new shape when one too many is tapped', () => {
    // A G-string C is kept from before; the player builds C on G B E around it,
    // after having tapped a stray note on the D string first.
    const { handedIn, tap, rake } = setup();
    tap({ string: 3, fret: 5 }); // C on the G string
    tap({ string: 2, fret: 2 }); // a stray E on the D string
    tap({ string: 4, fret: 5 }); // E on the B string
    tap({ string: 5, fret: 3 }); // G on the high E string: one too many
    rake(2.4, 5.4);
    expect(handedIn).toHaveLength(1);
    expect(checkVoicing(T, handedIn[0], C)).toMatchObject({ ok: true, inversion: 'Root' });
  });
});
