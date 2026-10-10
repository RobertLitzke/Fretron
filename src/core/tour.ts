// World Tour: the existing games strung into a tour. Each stop is one mode,
// played as it is anywhere else; its best rank on tour earns stars, and stars
// book the legs that follow. Pure data and arithmetic: the view and the save
// live elsewhere.

import { modeById, type Mode, type Rank } from './modes';

export interface Stop {
  city: string;
  /** A mode's id from modes.ts. */
  mode: string;
}

/** The emblem drawn on a leg's sleeve: see app/tour/sleeves.ts. */
export type Sleeve = 'record' | 'pig' | 'prism' | 'airship' | 'lantern' | 'sun';

export interface Leg {
  name: string;
  /** The kind of venue, under the name on its sticker. */
  venue: string;
  sleeve: Sleeve;
  /** The stars it takes to book the leg. */
  booking: number;
  stops: readonly Stop[];
}

// The order cycles notes, triads, bends, one or two of each at a time, and
// each time round a kind comes back a step harder. There are more bend modes
// than anything else, so the last leg is all bends: the encore.
export const LEGS: readonly Leg[] = [
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
      { city: 'Glasgow', mode: 'hunter-ear' },
    ],
  },
  {
    name: 'Motor City',
    venue: 'ballroom tour',
    sleeve: 'prism',
    booking: 10,
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
    booking: 18,
    stops: [
      { city: 'Amsterdam', mode: 'sweeper-random' },
      { city: 'Paris', mode: 'triads-target' },
      { city: 'Berlin', mode: 'bend-advanced' },
    ],
  },
  {
    name: 'America',
    venue: 'arenas',
    sleeve: 'lantern',
    booking: 27,
    stops: [
      { city: 'New York', mode: 'scalebend-minor' },
      { city: 'Philadelphia', mode: 'hunter-advanced' },
      { city: 'Los Angeles', mode: 'gridclear' },
    ],
  },
  {
    name: 'Japan',
    venue: 'stadium encore',
    sleeve: 'sun',
    booking: 36,
    stops: [
      { city: 'Nagoya', mode: 'trace-advanced' },
      { city: 'Osaka', mode: 'bend-virtuoso' },
      { city: 'Tokyo', mode: 'trace-virtuoso' },
    ],
  },
];

export const STOPS_PER_LEG = 3;
export const MAX_STARS = 3 * LEGS.length * STOPS_PER_LEG;

/** C: you played the gig, but nobody came. */
export function starsFor(rank: Rank | undefined): number {
  return rank === 'S' ? 3 : rank === 'A' ? 2 : rank === 'B' ? 1 : 0;
}

const ORDER: Record<Rank, number> = { C: 0, B: 1, A: 2, S: 3 };

/** The better of two ranks. */
export function betterRank(a: Rank | undefined, b: Rank): Rank {
  return a && ORDER[a] >= ORDER[b] ? a : b;
}

/** Best ranks on tour, by mode id. */
export type TourRanks = Readonly<Record<string, Rank>>;

export function legStars(leg: Leg, ranks: TourRanks): number {
  return leg.stops.reduce((sum, stop) => sum + starsFor(ranks[stop.mode]), 0);
}

export function totalStars(ranks: TourRanks): number {
  return LEGS.reduce((sum, leg) => sum + legStars(leg, ranks), 0);
}

export function legBooked(leg: Leg, ranks: TourRanks): boolean {
  return totalStars(ranks) >= leg.booking;
}

/** Every stop played at B or better. */
export function legSoldOut(leg: Leg, ranks: TourRanks): boolean {
  return leg.stops.every((stop) => starsFor(ranks[stop.mode]) >= 1);
}

/** Every stop at S. */
export function legGold(leg: Leg, ranks: TourRanks): boolean {
  return leg.stops.every((stop) => ranks[stop.mode] === 'S');
}

/** The next leg not yet booked, if any. */
export function nextBooking(ranks: TourRanks): Leg | undefined {
  return LEGS.find((leg) => !legBooked(leg, ranks));
}

/** The leg the player is on: the last one booked. */
export function currentLeg(ranks: TourRanks): number {
  let at = 0;
  LEGS.forEach((leg, i) => {
    if (legBooked(leg, ranks)) at = i;
  });
  return at;
}

/** Where a mode sits on the tour. */
export function stopFor(modeId: string): { leg: Leg; stop: Stop } | undefined {
  for (const leg of LEGS) {
    const stop = leg.stops.find((s) => s.mode === modeId);
    if (stop) return { leg, stop };
  }
  return undefined;
}

export function stopMode(stop: Stop): Mode {
  return modeById(stop.mode)!;
}
