import { describe, expect, it } from 'vitest';
import { BoardLayout, visibleFrets, type Hand } from '../src/core/geometry';

/** A long neck seen through a seven-fret window: the general, scrolling case. */
function layout(hand: Hand, width = 900, height = 330): BoardLayout {
  return new BoardLayout({ width, height, strings: 6, visible: 7, hand, lastFret: 22 });
}

describe('board layout', () => {
  it('shows a twelve-fret neck whole on any screen, so the default board never scrolls', () => {
    for (const width of [568, 667, 915, 1400]) {
      expect(visibleFrets(width, 12)).toBe(12);
      const whole = new BoardLayout({ width, height: 330, strings: 6, visible: visibleFrets(width, 12), hand: 'right', lastFret: 12 });
      expect(whole.maxStart).toBe(0);
      // The nut and the last fret wire are both on screen.
      expect(whole.x(0, 0)).toBeGreaterThan(0);
      expect(whole.x(12, 0)).toBeLessThan(width);
    }
  });

  it('shows a longer neck whole where its frets stay wide enough, and through a window where not', () => {
    expect(visibleFrets(915, 15)).toBe(15);
    expect(visibleFrets(667, 15)).toBe(12);
    expect(visibleFrets(915, 22)).toBe(15);
    expect(visibleFrets(1400, 22)).toBe(22);
  });

  it('puts the low string at the bottom for both hands', () => {
    for (const hand of ['right', 'left'] as const) {
      const l = layout(hand);
      expect(l.y(0)).toBeGreaterThan(l.y(5));
    }
  });

  it('puts the nut on the left for a right-handed board and on the right for a left-handed one', () => {
    const right = layout('right');
    const left = layout('left');
    expect(right.x(1, 0)).toBeLessThan(right.x(5, 0));
    expect(left.x(1, 0)).toBeGreaterThan(left.x(5, 0));
    // The two are mirror images.
    expect(left.x(3, 0)).toBeCloseTo(right.width - right.x(3, 0));
  });

  it('finds the cell whose centre it was given, for either hand and any window', () => {
    for (const hand of ['right', 'left'] as const) {
      const l = layout(hand);
      for (const start of [0, 3, 7.4, 15]) {
        for (let string = 0; string < 6; string++) {
          for (let fret = Math.floor(start) + 1; fret <= Math.floor(start) + l.visible; fret++) {
            const { x, y } = l.center({ string, fret }, start);
            expect(l.cellAt(x, y, start)).toEqual({ string, fret });
          }
        }
      }
    }
  });

  it('gives every touch in a cell to that cell, out to its edges', () => {
    for (const hand of ['right', 'left'] as const) {
      const l = layout(hand);
      const { x, y } = l.center({ string: 2, fret: 9 }, 5);
      const dx = l.fretLen * 0.49;
      const dy = l.spacing * 0.49;
      for (const [ox, oy] of [[-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]]) {
        expect(l.cellAt(x + ox, y + oy, 5)).toEqual({ string: 2, fret: 9 });
      }
    }
  });

  it('takes a touch on the nut, or beside it, as the open string', () => {
    for (const hand of ['right', 'left'] as const) {
      const l = layout(hand);
      for (let string = 0; string < 6; string++) {
        const { x, y } = l.center({ string, fret: 0 }, 0);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(l.width);
        expect(l.cellAt(x, y, 0)).toEqual({ string, fret: 0 });
        expect(l.cellAt(l.x(0, 0), y, 0)).toEqual({ string, fret: 0 });
      }
      // The room beside the nut is a finger wide, and all of it is the open string.
      const [edge, nut] = l.span(0);
      expect(Math.abs(l.x(nut, 0) - l.x(edge, 0))).toBeGreaterThanOrEqual(44);
      expect(l.cellAt(l.x(edge * 0.98, 0), l.y(2), 0)).toEqual({ string: 2, fret: 0 });
      // Just past the nut is the first fret.
      expect(l.cellAt(l.x(0.02, 0), l.y(2), 0)).toEqual({ string: 2, fret: 1 });
    }
  });

  it('has no open string to tap once the window has moved off the nut', () => {
    const l = layout('right');
    for (let x = 0; x < l.width; x += 7) expect(l.cellAt(x, l.y(2), 5)?.fret).toBeGreaterThan(0);
  });

  it('has no cell off the end of the board, past the last fret, or off the strings', () => {
    const l = layout('right');
    expect(l.cellAt(-5, l.y(2), 0)).toBeNull();
    expect(l.cellAt(l.x(22.5, 15), l.y(2), 15)).toBeNull();
    expect(l.cellAt(l.x(3.5, 0), l.y(-1), 0)).toBeNull();
    expect(l.cellAt(l.x(3.5, 0), l.y(6), 0)).toBeNull();
  });

  it('inverts x and y exactly', () => {
    for (const hand of ['right', 'left'] as const) {
      const l = layout(hand);
      const found = l.locate(l.x(11.25, 8), l.y(3.5), 8);
      expect(found.pos).toBeCloseTo(11.25);
      expect(found.string).toBeCloseTo(3.5);
    }
  });

  it('keeps the window on the neck', () => {
    const l = layout('right');
    expect(l.maxStart).toBe(15);
    expect(l.clampStart(-3)).toBe(0);
    expect(l.clampStart(40)).toBe(15);
  });

  it('moves the window only as far as it must to show a span of frets', () => {
    const l = layout('right');
    expect(l.startShowing(3, 5, 0)).toBe(0);
    expect(l.startShowing(9, 11, 0)).toBe(4);
    expect(l.startShowing(2, 3, 10)).toBe(1);
  });

  it('keeps strings at least 44 px apart on a short phone screen', () => {
    // 375 px tall, less the top row and the rail a scrolling neck needs.
    expect(layout('right', 667, 375 - 42 - 34).spacing).toBeGreaterThanOrEqual(44);
    // The default neck has no rail, and the board gets its room.
    expect(layout('right', 915, 412 - 42).spacing).toBeGreaterThanOrEqual(52);
  });
});
