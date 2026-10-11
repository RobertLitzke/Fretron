// World Tour: the existing games strung into tours. Each stop is one mode,
// played as it is anywhere else; its best rank on a tour earns stars, and
// stars book the legs that follow. The first tour is fixed; each later one is
// drawn from its number: the same climb in a shuffled order, on its own
// continent, in its own genre and era (looks.ts). Pure data and arithmetic: the
// view and the save live elsewhere.

import { CONTINENTS, ERAS, GENRES, VENUES } from './looks';
import { modeById, type Mode, type Rank } from './modes';
import { hash2, Rng } from './rng';

export interface Stop {
  city: string;
  /** A mode's id from modes.ts. */
  mode: string;
}

/** The emblem drawn on a leg's sleeve: see app/tour/sleeves.ts. */
export type Sleeve =
  | 'record' | 'pig' | 'prism' | 'airship' | 'lantern' | 'sun'
  | 'moon' | 'raven' | 'tower' | 'eye' | 'bolt' | 'roundel' | 'submarine'
  | 'crossing' | 'guitar' | 'spiral' | 'pin' | 'crown' | 'star';

export interface Leg {
  name: string;
  /** The kind of venue, under the name on its sticker. */
  venue: string;
  sleeve: Sleeve;
  /** The stars it takes to book the leg. */
  booking: number;
  stops: readonly Stop[];
}

export interface Look {
  /** A continent id from looks.ts, or 'world' for the first tour. */
  continent: string;
  genre: string;
  era: string;
}

export interface Tour {
  /** 1 is the first tour; what the save keeps its bests under. */
  id: number;
  /** Two digits, as the poster has it: '77. */
  year: number;
  /** "World Tour". */
  title: string;
  look: Look;
  legs: readonly Leg[];
}

/** What a tour keeps of a stop: its best rank, for the stars, and its best score. */
export interface TourBest {
  rank: Rank;
  /** Points or seconds, as the mode's table counts them. */
  value?: number;
}

/** A tour's bests, by mode id. */
export type TourRecord = Readonly<Record<string, TourBest>>;

// The order cycles notes, triads, bends, one or two of each at a time, and
// each time round a kind comes back a step harder. There are more bend modes
// than anything else, so the last leg is two bends: the encore.
/** The first tour, in a fixed order. */
export const CLASSIC: readonly Leg[] = [
  {
    name: 'The Midlands',
    venue: 'pub back rooms',
    sleeve: 'record',
    booking: 0,
    stops: [
      { city: 'Birmingham', mode: 'hunter-name' },
      { city: 'Wolverhampton', mode: 'sweeper' },
      { city: 'Coventry', mode: 'triads' },
    ],
  },
  {
    name: 'British Isles',
    venue: 'the club circuit',
    sleeve: 'pig',
    booking: 4,
    stops: [
      { city: 'London', mode: 'bend-standard' },
      { city: 'Manchester', mode: 'scalebend-blues' },
      { city: 'Glasgow', mode: 'sweeper-random' },
    ],
  },
  {
    name: 'Motor City',
    venue: 'ballroom tour',
    sleeve: 'prism',
    booking: 9,
    stops: [
      { city: 'Detroit', mode: 'triads-compact' },
      { city: 'Cleveland', mode: 'trace-standard' },
      { city: 'Chicago', mode: 'scalebend-major' },
    ],
  },
  {
    name: 'Europe',
    venue: 'theatres',
    sleeve: 'airship',
    booking: 17,
    stops: [
      { city: 'Amsterdam', mode: 'triads-target' },
      { city: 'Paris', mode: 'bend-advanced' },
      { city: 'Berlin', mode: 'scalebend-minor' },
    ],
  },
  {
    name: 'America',
    venue: 'arenas',
    sleeve: 'lantern',
    booking: 25,
    stops: [
      { city: 'New York', mode: 'hunter-advanced' },
      { city: 'Philadelphia', mode: 'gridclear' },
      { city: 'Los Angeles', mode: 'trace-advanced' },
    ],
  },
  {
    name: 'Japan',
    venue: 'stadium encore',
    sleeve: 'sun',
    booking: 34,
    stops: [
      { city: 'Osaka', mode: 'bend-virtuoso' },
      { city: 'Tokyo', mode: 'trace-virtuoso' },
    ],
  },
];

/** How many stops each leg has, on every tour. */
export const LEG_SIZES = CLASSIC.map((leg) => leg.stops.length);
export const MAX_STARS = 3 * LEG_SIZES.reduce((a, b) => a + b, 0);
export const FIRST_TOUR = 1;
export const LAST_TOUR = 13;

const BOOKINGS = CLASSIC.map((leg) => leg.booking);

export type Kind = 'notes' | 'triads' | 'bends';

export function kindOf(mode: string): Kind {
  return /^(hunter|sweeper)/.test(mode) ? 'notes' : /^(triads|gridclear)/.test(mode) ? 'triads' : 'bends';
}

/** The climb every tour keeps: each round has some of each kind, a step harder than the last. */
const ROUNDS: readonly Record<Kind, readonly string[]>[] = [
  { notes: ['hunter-name', 'sweeper'], triads: ['triads'], bends: ['bend-standard', 'scalebend-blues'] },
  { notes: ['sweeper-random'], triads: ['triads-compact'], bends: ['trace-standard', 'scalebend-major'] },
  { notes: [], triads: ['triads-target'], bends: ['bend-advanced', 'scalebend-minor'] },
  { notes: ['hunter-advanced'], triads: ['gridclear'], bends: ['trace-advanced'] },
];
const ENCORE = ['bend-virtuoso', 'trace-virtuoso'];
/** Pairs close enough in difficulty to trade rounds. */
const TRADES: readonly [number, Kind, number][] = [
  [1, 'triads', 0],
  [1, 'bends', 1],
];
/** Before the encore, never more than this many of a kind in a row. */
export const MAX_RUN = 2;

export function longestRun(modes: readonly string[]): number {
  let best = 0;
  let run = 0;
  modes.forEach((m, i) => {
    run = i > 0 && kindOf(m) === kindOf(modes[i - 1]) ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** Every stop's mode in order, shuffled within the climb. */
function order(rng: Rng): string[] {
  for (;;) {
    const rounds = ROUNDS.map((r) => ({ notes: r.notes.slice(), triads: r.triads.slice(), bends: r.bends.slice() }));
    // Now and then a game trades places with its like from the next round.
    for (const [round, kind, index] of TRADES) {
      if (rng.next() < 0.5) {
        const a = rounds[round][kind];
        const b = rounds[round + 1][kind];
        [a[index], b[index]] = [b[index], a[index]];
      }
    }
    const out: string[] = [];
    for (const round of rounds) {
      for (const kind of rng.shuffle<Kind>(['notes', 'triads', 'bends'])) out.push(...rng.shuffle(round[kind]));
    }
    if (longestRun(out) <= MAX_RUN) return [...out, ...rng.shuffle(ENCORE)];
  }
}

// Genres and continents each come round in a shuffled order, so tours that
// follow each other never share either; the era is drawn per tour.
const deck = new Rng(0x7004);
const GENRE_ORDER = deck.shuffle(GENRES);
const CONTINENT_ORDER = deck.shuffle(CONTINENTS);

function drawn(id: number): Tour {
  const rng = new Rng(hash2(0x7004, id));
  const genre = GENRE_ORDER[(id - 2) % GENRE_ORDER.length];
  const continent = CONTINENT_ORDER[(id - 2) % CONTINENT_ORDER.length];
  const era = rng.pick(ERAS);
  const modes = order(rng);
  const regions = rng.shuffle(continent.regions);
  const sleeves = rng.shuffle(genre.sleeves);
  return {
    id,
    year: era.from + rng.int(era.to - era.from + 1),
    title: continent.title,
    look: { continent: continent.id, genre: genre.id, era: era.id },
    legs: regions.map((region, i) => {
      const cities = rng.shuffle(region.cities);
      const from = LEG_SIZES.slice(0, i).reduce((a, b) => a + b, 0);
      return {
        name: region.name,
        venue: VENUES[i],
        sleeve: sleeves[i],
        booking: BOOKINGS[i],
        stops: modes.slice(from, from + LEG_SIZES[i]).map((mode, k) => ({ city: cities[k], mode })),
      };
    }),
  };
}

const FIRST: Tour = { id: FIRST_TOUR, year: 77, title: 'World Tour', look: { continent: 'world', genre: 'hardrock', era: 'seventies' }, legs: CLASSIC };

export function tourFor(id: number): Tour {
  return id === FIRST_TOUR ? FIRST : drawn(id);
}

/** C: you played the gig, but nobody came. */
export function starsFor(rank: Rank | undefined): number {
  return rank === 'S' ? 3 : rank === 'A' ? 2 : rank === 'B' ? 1 : 0;
}

const ORDER: Record<Rank, number> = { C: 0, B: 1, A: 2, S: 3 };

/** The better of two ranks. */
export function betterRank(a: Rank | undefined, b: Rank): Rank {
  return a && ORDER[a] >= ORDER[b] ? a : b;
}

export function legStars(leg: Leg, record: TourRecord): number {
  return leg.stops.reduce((sum, stop) => sum + starsFor(record[stop.mode]?.rank), 0);
}

export function totalStars(legs: readonly Leg[], record: TourRecord): number {
  return legs.reduce((sum, leg) => sum + legStars(leg, record), 0);
}

export function legBooked(leg: Leg, stars: number): boolean {
  return stars >= leg.booking;
}

/** Every stop played at B or better. */
export function legSoldOut(leg: Leg, record: TourRecord): boolean {
  return leg.stops.every((stop) => starsFor(record[stop.mode]?.rank) >= 1);
}

/** Every stop at S. */
export function legGold(leg: Leg, record: TourRecord): boolean {
  return leg.stops.every((stop) => record[stop.mode]?.rank === 'S');
}

/** The next leg not yet booked, if any. */
export function nextBooking(legs: readonly Leg[], stars: number): Leg | undefined {
  return legs.find((leg) => !legBooked(leg, stars));
}

/** The leg the player is on: the last one booked. */
export function currentLeg(legs: readonly Leg[], stars: number): number {
  let at = 0;
  legs.forEach((leg, i) => {
    if (legBooked(leg, stars)) at = i;
  });
  return at;
}

/** A tour is open once the one before it has booked its last leg. */
export function tourOpen(id: number, records: Readonly<Record<string, TourRecord>>): boolean {
  if (id === FIRST_TOUR) return true;
  if (!Number.isInteger(id) || id < FIRST_TOUR || id > LAST_TOUR) return false;
  const before = tourFor(id - 1);
  return legBooked(before.legs.at(-1)!, totalStars(before.legs, records[id - 1] ?? {}));
}

/** Where a mode sits on a tour. */
export function stopFor(legs: readonly Leg[], modeId: string): { leg: Leg; stop: Stop } | undefined {
  for (const leg of legs) {
    const stop = leg.stops.find((s) => s.mode === modeId);
    if (stop) return { leg, stop };
  }
  return undefined;
}

export function stopMode(stop: Stop): Mode {
  return modeById(stop.mode)!;
}
