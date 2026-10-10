import { describe, expect, it } from 'vitest';
import { CONTINENTS, ERAS, GENRES } from '../src/core/looks';
import { modeById, MODES } from '../src/core/modes';
import { emptySave, migrate, withTourRun } from '../src/core/storage';
import {
  betterRank,
  CLASSIC,
  currentLeg,
  FIRST_TOUR,
  LAST_TOUR,
  legBooked,
  legSoldOut,
  longestRun,
  MAX_RUN,
  MAX_STARS,
  nextBooking,
  starsFor,
  stopFor,
  totalStars,
  tourFor,
  tourOpen,
  type TourRecord,
} from '../src/core/tour';
import { tourRewrite } from '../src/app/tour/route';

const modesOf = (year: number) => tourFor(year).legs.flatMap((leg) => leg.stops.map((s) => s.mode));
const TOURS = Array.from({ length: LAST_TOUR - FIRST_TOUR + 1 }, (_, i) => FIRST_TOUR + i);

describe('the tours', () => {
  it('each play every game once', () => {
    for (const year of TOURS) {
      const ids = modesOf(year);
      expect(ids.slice().sort()).toEqual(MODES.map((m) => m.id).sort());
      for (const id of ids) expect(modeById(id)).toBeDefined();
    }
  });

  it('book their legs in order, the first free', () => {
    for (const year of TOURS) {
      const legs = tourFor(year).legs;
      expect(legs[0].booking).toBe(0);
      for (let i = 1; i < legs.length; i++) expect(legs[i].booking).toBeGreaterThan(legs[i - 1].booking);
      expect(legs.at(-1)!.booking).toBeLessThan(MAX_STARS);
    }
  });

  it('never have more than two of a kind in a row before the encore', () => {
    for (const year of TOURS) expect(longestRun(modesOf(year).slice(0, -2))).toBeLessThanOrEqual(MAX_RUN);
  });

  it('keep the climb, only shuffled: the encore last, the easiest games early', () => {
    for (const year of TOURS) {
      const ids = modesOf(year);
      expect(ids.slice(-2).sort()).toEqual(['bend-virtuoso', 'trace-virtuoso']);
      for (const easy of ['hunter-name', 'sweeper', 'triads', 'bend-standard', 'scalebend-blues']) expect(ids.indexOf(easy)).toBeLessThan(5);
    }
  });

  it('differ from year to year, and are the same each time a year is drawn', () => {
    expect(tourFor(FIRST_TOUR).legs).toBe(CLASSIC);
    expect(modesOf(2)).toEqual(modesOf(2));
    expect(tourFor(2)).toEqual(tourFor(2));
    const orders = new Set(TOURS.map((y) => modesOf(y).join()));
    expect(orders.size).toBeGreaterThan(TOURS.length / 2);
    for (const year of TOURS) expect(new Set(tourFor(year).legs.map((l) => l.name)).size).toBe(6);
  });

  it('each have a continent, genre and era of their own, its cities on that continent', () => {
    for (const id of TOURS.slice(1)) {
      const tour = tourFor(id);
      const continent = CONTINENTS.find((c) => c.id === tour.look.continent)!;
      expect(continent).toBeDefined();
      expect(GENRES.some((g) => g.id === tour.look.genre)).toBe(true);
      const era = ERAS.find((e) => e.id === tour.look.era)!;
      expect(tour.year).toBeGreaterThanOrEqual(era.from);
      expect(tour.year).toBeLessThanOrEqual(era.to);
      const cities = continent.regions.flatMap((r) => r.cities);
      for (const leg of tour.legs) for (const stop of leg.stops) expect(cities).toContain(stop.city);
      const sleeves = GENRES.find((g) => g.id === tour.look.genre)!.sleeves;
      for (const leg of tour.legs) expect(sleeves).toContain(leg.sleeve);
      const before = tourFor(id - 1);
      expect(tour.look.genre).not.toBe(before.look.genre);
      expect(tour.look.continent).not.toBe(before.look.continent);
    }
  });

  it('turn ranks into stars', () => {
    expect([starsFor('S'), starsFor('A'), starsFor('B'), starsFor('C'), starsFor(undefined)]).toEqual([3, 2, 1, 0, 0]);
    expect(betterRank('A', 'B')).toBe('A');
    expect(betterRank('B', 'S')).toBe('S');
    expect(betterRank(undefined, 'C')).toBe('C');
  });

  it('count stars and book legs', () => {
    const record: TourRecord = { 'hunter-name': { rank: 'S' }, sweeper: { rank: 'B' }, triads: { rank: 'C' } };
    const stars = totalStars(CLASSIC, record);
    expect(stars).toBe(4);
    expect(legBooked(CLASSIC[1], stars)).toBe(true);
    expect(legBooked(CLASSIC[2], stars)).toBe(false);
    expect(nextBooking(CLASSIC, stars)).toBe(CLASSIC[2]);
    expect(currentLeg(CLASSIC, stars)).toBe(1);
    expect(legSoldOut(CLASSIC[0], record)).toBe(false);
    expect(legSoldOut(CLASSIC[0], { ...record, triads: { rank: 'B' } })).toBe(true);
    expect(stopFor(CLASSIC, 'gridclear')?.stop.city).toBe('Los Angeles');
  });

  it('open a tour once the last leg of the one before is booked', () => {
    expect(tourOpen(FIRST_TOUR, {})).toBe(true);
    expect(tourOpen(2, {})).toBe(false);
    const all: TourRecord = Object.fromEntries(MODES.map((m) => [m.id, { rank: 'A' as const }]));
    expect(tourOpen(2, { 1: all })).toBe(true);
    expect(tourOpen(3, { 1: all })).toBe(false);
    expect(tourOpen(LAST_TOUR + 1, {})).toBe(false);
  });
});

describe('a tour in the save', () => {
  it('keeps the best rank and the best score, each on its own', () => {
    let save = withTourRun(emptySave(), 1, 'sweeper', 'A', 80, 'low');
    save = withTourRun(save, 1, 'sweeper', 'C', 70, 'low');
    expect(save.tours[1]).toEqual({ sweeper: { rank: 'A', value: 70 } });
    expect(withTourRun(save, 1, 'sweeper', 'B', 90, 'low')).toBe(save);
    save = withTourRun(save, 2, 'triads', 'B', 9000, 'high');
    save = withTourRun(save, 2, 'triads', 'B', 12000, 'high');
    expect(save.tours[2]).toEqual({ triads: { rank: 'B', value: 12000 } });
    expect(save.tours[1].triads).toBeUndefined();
    expect(migrate(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('repairs what it cannot read, and moves the first tour\'s ranks over', () => {
    expect(migrate({ tours: { 1: { sweeper: { rank: 'Z' }, triads: { rank: 'S', value: 'x' } }, 2: 'x' } }).tours).toEqual({ 1: { triads: { rank: 'S' } } });
    expect(migrate({ tour: { sweeper: 'A', triads: 'Q' } }).tours).toEqual({ 1: { sweeper: { rank: 'A' } } });
  });
});

describe('the tour routes', () => {
  it('keep a game on tour', () => {
    expect(tourRewrite('/play/hunter/name', '/tour/play/hunter/name')).toBe('/tour/play/hunter/name');
    expect(tourRewrite('/home', '/tour/play/sweeper/note')).toBe('/tour');
    expect(tourRewrite('/scores', '/tour/play/sweeper/note')).toBe('/scores');
    expect(tourRewrite('/home', '/play/hunter/name')).toBe('/home');
    expect(tourRewrite('/play/bend/standard', '/home')).toBe('/play/bend/standard');
  });
});
