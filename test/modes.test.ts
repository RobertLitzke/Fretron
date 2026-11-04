import { describe, expect, it } from 'vitest';
import { GAME_KIND, kindOf, modeById, MODES, modesOf } from '../src/core/modes';

describe('modes', () => {
  it('gives every mode a game, and every game a kind', () => {
    for (const mode of MODES) expect(GAME_KIND[mode.game], mode.id).toBeDefined();
  });

  it('has no two modes with one id', () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
  });

  it('lists a game by its game, not its title', () => {
    expect(modesOf('hunter').map((m) => m.id)).toEqual(['hunter-name', 'hunter-advanced']);
    expect(modesOf('triads').map((m) => m.id)).toEqual(['triads', 'triads-target', 'triads-compact']);
    expect(modesOf('gridclear').map((m) => m.id)).toEqual(['gridclear']);
  });

  it("keeps a song's own version of a game off the game's list", () => {
    const song = MODES.filter((m) => m.song);
    expect(song.length).toBeGreaterThan(0);
    for (const m of song) expect(modesOf(m.game)).not.toContain(m);
  });

  it('sorts the tour stops into notes, triads and bends', () => {
    expect(kindOf(modeById('sweeper-random')!)).toBe('notes');
    expect(kindOf(modeById('gridclear')!)).toBe('triads');
    expect(kindOf(modeById('scalebend-blues')!)).toBe('bends');
    expect(kindOf(modeById('scales-hard-dorian')!)).toBe('bends');
  });
});
