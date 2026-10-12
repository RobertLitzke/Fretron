// The games, as the menu, the score tables and the result card see them, and
// the rank each run earns.

import { BEND_TIERS, type BendTier } from './bend';
import { DEFAULT_FRETS } from './music';
import { SCALE_IDS, type ScaleId } from './scaleBend';
import { BUILD_LEVELS, BUILDER_SCALES, type BuildLevel } from './scaleBuilder';
import { SONG_GAMES, SONGS } from './songs';

export type Rank = 'S' | 'A' | 'B' | 'C';

/** The design document's 5.2. */
export const RANK_WORDS: Record<Rank, string> = {
  S: 'Master',
  A: 'Session Pro',
  B: 'Gigging Musician',
  C: 'Garage Band',
};

export interface Mode {
  /** The key its score table is stored under. */
  id: string;
  title: string;
  /** Shown under the title where there is more than one of a kind. */
  variant: string;
  route: string;
  /** Whether a bigger number or a smaller one is the better run. */
  better: 'high' | 'low';
  unit: 'points' | 'seconds';
  /** The key its score table is stored under, where that is not its id: a table started afresh when the scoring changed. */
  table?: string;
  /** Not a stop on the World Tour. */
  offTour?: boolean;
  /** One of many tables of a kind: the Scores page lists it only once it has a score. */
  listOncePlayed?: boolean;
}

const TIER_WORDS: Record<BendTier, string> = { standard: 'Standard', advanced: 'Advanced', virtuoso: 'Virtuoso' };
const SCALE_WORDS: Record<ScaleId, string> = { blues: 'Blues', major: 'Major', minor: 'Minor' };
const LEVEL_WORDS: Record<BuildLevel, string> = { easy: 'Easy', hard: 'Hard' };

export const MODES: readonly Mode[] = [
  { id: 'hunter-name', title: 'Speed Hunter', variant: 'By name', route: '/play/hunter/name', better: 'low', unit: 'seconds' },
  { id: 'hunter-advanced', title: 'Speed Hunter', variant: 'Advanced', route: '/play/hunter/advanced', better: 'low', unit: 'seconds' },
  { id: 'sweeper', title: 'Fret Sweeper', variant: 'By note', route: '/play/sweeper/note', better: 'low', unit: 'seconds' },
  { id: 'sweeper-random', title: 'Fret Sweeper', variant: 'Random', route: '/play/sweeper/random', better: 'low', unit: 'seconds' },
  { id: 'triads', title: 'Triads', variant: 'Progressions', route: '/play/triads', better: 'high', unit: 'points', table: 'triads.2' },
  { id: 'triads-target', title: 'Triads', variant: 'Targets', route: '/play/triads/target', better: 'high', unit: 'points', table: 'triads-target.2' },
  { id: 'triads-compact', title: 'Triads', variant: 'Compact', route: '/play/triads/compact', better: 'high', unit: 'points', table: 'triads-compact.2' },
  { id: 'gridclear', title: 'Triads', variant: 'Grid clear', route: '/play/gridclear', better: 'low', unit: 'seconds' },
  ...BEND_TIERS.map(
    (tier): Mode => ({ id: `bend-${tier}`, title: 'Bend by Ear', variant: TIER_WORDS[tier], route: `/play/bend/${tier}`, better: 'high', unit: 'points', table: `bend-${tier}.3` }),
  ),
  ...BEND_TIERS.map(
    (tier): Mode => ({ id: `trace-${tier}`, title: 'Bend Trace', variant: TIER_WORDS[tier], route: `/play/trace/${tier}`, better: 'high', unit: 'points', table: `trace-${tier}.4` }),
  ),
  // Each song's own versions of the games: titled by the song, named by the game.
  ...SONGS.flatMap((song) =>
    SONG_GAMES.filter((game) => game.has(song)).map(
      (game): Mode => ({
        id: `song-${song.id}-${game.kind}`,
        title: song.title,
        variant: game.name,
        route: `/play/song/${song.id}/${game.kind}`,
        better: 'high',
        unit: 'points',
        table: `song-${song.id}-${game.kind}.2`,
        offTour: true,
      }),
    ),
  ),
  ...SCALE_IDS.map(
    (scale): Mode => ({ id: `scalebend-${scale}`, title: 'Scale Bends', variant: SCALE_WORDS[scale], route: `/play/scalebend/${scale}`, better: 'high', unit: 'points', table: `scalebend-${scale}.3` }),
  ),
  // A table for each scale at each level: kept off the tour, and off the Scores page until played.
  ...BUILD_LEVELS.flatMap((level) =>
    BUILDER_SCALES.map(
      (scale): Mode => ({
        id: `scales-${level}-${scale.id}`,
        title: 'Scale Builder',
        variant: `${scale.name} · ${LEVEL_WORDS[level]}`,
        route: `/play/scales/${level}/${scale.id}`,
        better: 'high',
        unit: 'points',
        offTour: true,
        listOncePlayed: true,
      }),
    ),
  ),
];

export function modeById(id: string): Mode | undefined {
  return MODES.find((m) => m.id === id);
}

/**
 * The key a mode's score table is kept under. A longer neck is a different
 * game (more frets to sweep, more places to look), so each length has its own.
 */
export function tableKey(mode: Mode, frets: number): string {
  const id = mode.table ?? mode.id;
  return frets === DEFAULT_FRETS ? id : `${id}@${frets}`;
}

export function tierWords(tier: BendTier): string {
  return TIER_WORDS[tier];
}

export function levelWords(level: BuildLevel): string {
  return LEVEL_WORDS[level];
}

export function scaleWords(scale: ScaleId): string {
  return SCALE_WORDS[scale];
}

export function asTier(text: string): BendTier {
  return (BEND_TIERS as readonly string[]).includes(text) ? (text as BendTier) : 'standard';
}

/** m:ss.t */
export function formatSeconds(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

export function formatValue(mode: Mode, value: number): string {
  return mode.unit === 'seconds' ? formatSeconds(value) : Math.round(value).toLocaleString('en-US');
}

// --- ranks ---------------------------------------------------------------------
// First guesses, to be moved once real runs show what a good one looks like.

/** What S, A and B each take, in the measure a game's rank goes by. */
export interface Bars {
  s: number;
  a: number;
  b: number;
  /** Whether the rank is for reaching the bar from below, or keeping under it. */
  better: 'high' | 'low';
}

export function rankBy(value: number, bars: Bars): Rank {
  const { s, a, b } = bars;
  if (bars.better === 'high') return value >= s ? 'S' : value >= a ? 'A' : value >= b ? 'B' : 'C';
  return value <= s ? 'S' : value <= a ? 'A' : value <= b ? 'B' : 'C';
}

/** Seconds per note, penalties included. The advanced game has one place to find, not six, and is given longer. */
export const HUNTER_BARS: Bars = { s: 1.0, a: 1.8, b: 3.2, better: 'low' };
export const HUNTER_ADVANCED_BARS: Bars = { s: 1.6, a: 2.6, b: 4.2, better: 'low' };
/** Seconds per fret cleared, penalties included. */
export const SWEEP_BARS: Bars = { s: 1.4, a: 2.3, b: 3.6, better: 'low' };
/** The same, where every fret is a new note to find: nearer Speed Hunter's pace. */
export const SWEEP_RANDOM_BARS: Bars = { s: 1.2, a: 2.0, b: 3.4, better: 'low' };
/**
 * The share of the points on offer: what instant chords with no wrong rake,
 * each at the streak's full multiplier, would have won. A perfect run, at two
 * seconds a chord, takes about 80% of it.
 */
export const TRIAD_BARS: Bars = { s: 0.65, a: 0.42, b: 0.22, better: 'high' };
/** Seconds per voicing found, penalties included. */
export const GRID_BARS: Bars = { s: 4, a: 7, b: 12, better: 'low' };
/** The mean miss, in cents, across the run. */
export const BEND_BARS: Bars = { s: 8, a: 15, b: 30, better: 'low' };
export const TRACE_BARS: Bars = { s: 12, a: 22, b: 40, better: 'low' };
/** Scale Builder's mean miss: a little wider than Bend by Ear's, as nothing is played to match. */
export const SCALE_BUILD_BARS: Bars = { s: 10, a: 18, b: 32, better: 'low' };

export function rankHunter(seconds: number, prompts: number, advanced = false): Rank {
  return rankBy(seconds / prompts, advanced ? HUNTER_ADVANCED_BARS : HUNTER_BARS);
}

export function rankSweep(seconds: number, cells: number): Rank {
  return rankBy(seconds / cells, SWEEP_BARS);
}

export function rankSweepRandom(seconds: number, cells: number): Rank {
  return rankBy(seconds / cells, SWEEP_RANDOM_BARS);
}

export function rankTriads(points: number, possible: number): Rank {
  return rankBy(possible > 0 ? points / possible : 0, TRIAD_BARS);
}

export function rankGrid(seconds: number, voicings: number): Rank {
  return rankBy(seconds / voicings, GRID_BARS);
}

export function rankBend(meanCents: number): Rank {
  return rankBy(meanCents, BEND_BARS);
}

export function rankTrace(meanCents: number): Rank {
  return rankBy(meanCents, TRACE_BARS);
}

const RANKS_DOWN: readonly Rank[] = ['S', 'A', 'B', 'C'];

/** By the mean miss; on Hard, each step named wrong costs a star. */
export function rankScaleBuild(meanCents: number, wrongSteps = 0): Rank {
  const at = RANKS_DOWN.indexOf(rankBy(meanCents, SCALE_BUILD_BARS));
  return RANKS_DOWN[Math.min(RANKS_DOWN.length - 1, at + wrongSteps)];
}

// --- star targets --------------------------------------------------------------
// What to aim for: the run each rank takes, in the numbers the game shows.

/** What S, A and B take, worded: "Finish within" 0:20.0, 0:36.0, 1:04.0. */
export interface Targets {
  lead: string;
  ranks: readonly { rank: Rank; value: string }[];
}

function targets(lead: string, bars: Bars, word: (bar: number) => string): Targets {
  return { lead, ranks: (['S', 'A', 'B'] as const).map((rank) => ({ rank, value: word(bars[rank === 'S' ? 's' : rank === 'A' ? 'a' : 'b']) })) };
}

/** A time rounded down to the tenth the clock shows, so that a time shown as the target makes it. */
function within(seconds: number): string {
  return formatSeconds(Math.floor(seconds * 10 + 1e-9) / 10);
}

/** For a run of `prompts` notes. */
export function hunterTargets(prompts: number, advanced = false): Targets {
  return targets('Finish within', advanced ? HUNTER_ADVANCED_BARS : HUNTER_BARS, (bar) => within(bar * prompts));
}

/** For a neck of `cells` frets, open strings included. */
export function sweepTargets(cells: number, random = false): Targets {
  return targets('Finish within', random ? SWEEP_RANDOM_BARS : SWEEP_BARS, (bar) => within(bar * cells));
}

export function gridTargets(voicings: number): Targets {
  return targets('Finish within', GRID_BARS, (bar) => within(bar * voicings));
}

/**
 * Before a run, the share of the points on offer; afterwards, when what was on
 * offer is known, the points themselves.
 */
export function triadTargets(possible?: number): Targets {
  return possible
    ? targets('Score at least', TRIAD_BARS, (bar) => Math.ceil(bar * possible - 1e-9).toLocaleString('en-US'))
    : targets('Share of the points to score', TRIAD_BARS, (bar) => `${Math.round(bar * 100)}%`);
}

export function scaleBuildTargets(): Targets {
  return targets('Average miss within', SCALE_BUILD_BARS, (bar) => `${bar} ¢`);
}

/** Bend ranks go by pitch, not points: the mean miss over the run. */
export function bendTargets(trace = false): Targets {
  return targets('Average miss within', trace ? TRACE_BARS : BEND_BARS, (bar) => `${bar} ¢`);
}
