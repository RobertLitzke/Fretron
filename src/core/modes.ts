// The games, as the menu, the score tables and the result card see them, and
// the rank each run earns.

import { BEND_TIERS, type BendTier } from './bend';
import { DEFAULT_FRETS } from './music';
import { SCALE_IDS, type ScaleId } from './scaleBend';
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
}

const TIER_WORDS: Record<BendTier, string> = { standard: 'Standard', advanced: 'Advanced', virtuoso: 'Virtuoso' };
const SCALE_WORDS: Record<ScaleId, string> = { blues: 'Blues', major: 'Major', minor: 'Minor' };

export const MODES: readonly Mode[] = [
  { id: 'hunter-name', title: 'Speed Hunter', variant: 'By name', route: '/play/hunter/name', better: 'low', unit: 'seconds' },
  { id: 'hunter-ear', title: 'Speed Hunter', variant: 'By ear', route: '/play/hunter/ear', better: 'low', unit: 'seconds' },
  { id: 'hunter-advanced', title: 'Speed Hunter', variant: 'Advanced', route: '/play/hunter/advanced', better: 'low', unit: 'seconds' },
  { id: 'sweeper', title: 'Fret Sweeper', variant: 'By note', route: '/play/sweeper/note', better: 'low', unit: 'seconds' },
  { id: 'sweeper-random', title: 'Fret Sweeper', variant: 'Random', route: '/play/sweeper/random', better: 'low', unit: 'seconds' },
  { id: 'triads', title: 'Triads', variant: 'Progressions', route: '/play/triads', better: 'high', unit: 'points' },
  { id: 'triads-target', title: 'Triads', variant: 'Targets', route: '/play/triads/target', better: 'high', unit: 'points' },
  { id: 'triads-compact', title: 'Triads', variant: 'Compact', route: '/play/triads/compact', better: 'high', unit: 'points' },
  { id: 'gridclear', title: 'Triads', variant: 'Grid clear', route: '/play/gridclear', better: 'low', unit: 'seconds' },
  ...BEND_TIERS.map(
    (tier): Mode => ({ id: `bend-${tier}`, title: 'Bend by Ear', variant: TIER_WORDS[tier], route: `/play/bend/${tier}`, better: 'high', unit: 'points', table: `bend-${tier}.2` }),
  ),
  ...BEND_TIERS.map(
    (tier): Mode => ({ id: `trace-${tier}`, title: 'Bend Trace', variant: TIER_WORDS[tier], route: `/play/trace/${tier}`, better: 'high', unit: 'points', table: `trace-${tier}.3` }),
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
        offTour: true,
      }),
    ),
  ),
  ...SCALE_IDS.map(
    (scale): Mode => ({ id: `scalebend-${scale}`, title: 'Scale Bends', variant: SCALE_WORDS[scale], route: `/play/scalebend/${scale}`, better: 'high', unit: 'points', table: `scalebend-${scale}.2` }),
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

function byAtLeast(value: number, s: number, a: number, b: number): Rank {
  return value >= s ? 'S' : value >= a ? 'A' : value >= b ? 'B' : 'C';
}

function byAtMost(value: number, s: number, a: number, b: number): Rank {
  return value <= s ? 'S' : value <= a ? 'A' : value <= b ? 'B' : 'C';
}

/** By seconds per note, penalties included. The advanced game has one place to find, not six, and is given longer. */
export function rankHunter(seconds: number, prompts: number, advanced = false): Rank {
  return advanced ? byAtMost(seconds / prompts, 1.6, 2.6, 4.2) : byAtMost(seconds / prompts, 1.0, 1.8, 3.2);
}

/** By seconds per fret cleared, penalties included. */
export function rankSweep(seconds: number, cells: number): Rank {
  return byAtMost(seconds / cells, 1.4, 2.3, 3.6);
}

/** The same, where every fret is a new note to find: nearer Speed Hunter's pace. */
export function rankSweepRandom(seconds: number, cells: number): Rank {
  return byAtMost(seconds / cells, 1.2, 2.0, 3.4);
}

/** By the share of the points on offer. */
export function rankTriads(points: number, possible: number): Rank {
  return byAtLeast(possible > 0 ? points / possible : 0, 0.7, 0.5, 0.3);
}

/** By seconds per voicing found, penalties included. */
export function rankGrid(seconds: number, voicings: number): Rank {
  return byAtMost(seconds / voicings, 4, 7, 12);
}

/** By the mean miss, in cents, across the run. */
export function rankBend(meanCents: number): Rank {
  return byAtMost(meanCents, 8, 15, 30);
}

export function rankTrace(meanCents: number): Rank {
  return byAtMost(meanCents, 12, 22, 40);
}
