import { describe, expect, it } from 'vitest';
import { modeById, MODES } from '../src/core/modes';
import { emptySave, migrate, withTourRank } from '../src/core/storage';
import { betterRank, currentLeg, legBooked, legSoldOut, LEGS, MAX_STARS, nextBooking, starsFor, stopFor, totalStars } from '../src/core/tour';
import { tourRewrite } from '../src/app/tour/route';

describe('the tour', () => {
  it('plays every game once', () => {
    const ids = LEGS.flatMap((leg) => leg.stops.map((s) => s.mode));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(MODES.map((m) => m.id).sort());
    for (const id of ids) expect(modeById(id)).toBeDefined();
  });

  it('books its legs in order, the first free', () => {
    expect(LEGS[0].booking).toBe(0);
    for (let i = 1; i < LEGS.length; i++) expect(LEGS[i].booking).toBeGreaterThan(LEGS[i - 1].booking);
    expect(LEGS.at(-1)!.booking).toBeLessThan(MAX_STARS);
  });

  it('never has more than two of a kind in a row before the encore', () => {
    const kind = (id: string) => (/^(hunter|sweeper)/.test(id) ? 'notes' : /^(triads|gridclear)/.test(id) ? 'triads' : 'bends');
    const ids = LEGS.flatMap((leg) => leg.stops.map((s) => s.mode)).slice(0, -3);
    let run = 1;
    for (let i = 1; i < ids.length; i++) {
      run = kind(ids[i]) === kind(ids[i - 1]) ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
    }
  });

  it('turns ranks into stars', () => {
    expect([starsFor('S'), starsFor('A'), starsFor('B'), starsFor('C'), starsFor(undefined)]).toEqual([3, 2, 1, 0, 0]);
    expect(betterRank('A', 'B')).toBe('A');
    expect(betterRank('B', 'S')).toBe('S');
    expect(betterRank(undefined, 'C')).toBe('C');
  });

  it('counts stars and books legs', () => {
    const ranks = { 'hunter-name': 'S', sweeper: 'B', triads: 'C' } as const;
    expect(totalStars(ranks)).toBe(4);
    expect(legBooked(LEGS[1], ranks)).toBe(true);
    expect(legBooked(LEGS[2], ranks)).toBe(false);
    expect(nextBooking(ranks)).toBe(LEGS[2]);
    expect(currentLeg(ranks)).toBe(1);
    expect(legSoldOut(LEGS[0], ranks)).toBe(false);
    expect(legSoldOut(LEGS[0], { ...ranks, triads: 'B' })).toBe(true);
    expect(stopFor('gridclear')?.stop.city).toBe('Los Angeles');
  });

  it('keeps the best rank, and survives a round trip', () => {
    let save = withTourRank(emptySave(), 'sweeper', 'A');
    save = withTourRank(save, 'sweeper', 'C');
    expect(save.tour).toEqual({ sweeper: 'A' });
    expect(withTourRank(save, 'sweeper', 'B')).toBe(save);
    expect(migrate(JSON.parse(JSON.stringify(save)))).toEqual(save);
    expect(migrate({ tour: { sweeper: 'Z', triads: 'S' } }).tour).toEqual({ triads: 'S' });
  });

  it('keeps a game on tour', () => {
    expect(tourRewrite('/play/hunter/name', '/tour/play/hunter/name')).toBe('/tour/play/hunter/name');
    expect(tourRewrite('/home', '/tour/play/sweeper/note')).toBe('/tour');
    expect(tourRewrite('/scores', '/tour/play/sweeper/note')).toBe('/scores');
    expect(tourRewrite('/home', '/play/hunter/name')).toBe('/home');
    expect(tourRewrite('/play/bend/standard', '/home')).toBe('/play/bend/standard');
  });
});
