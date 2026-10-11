// Simulated runs of the point-scored games, to check them against the target
// scale: perfect about 100k, very good 77–90k, good about 50k, a beginner
// about 30k, a first try about 10k. Run with: npx vite-node tools/scoring-sim.ts
import { BEND_PROMPTS, scoreGrade, type Grade } from '../src/core/bend';
import { NO_STREAK, stepStreak, topMultiplier } from '../src/core/streak';
import {
  COMPACT_BONUS,
  compactPoints,
  makeRun,
  MODERATE_BONUS,
  SMOOTH_BONUS,
  TARGET_BONUS,
  targetPoints,
  timePoints,
  TRIAD_BASE_POINTS,
} from '../src/core/triads';
import { Rng } from '../src/core/rng';

const RUNS = 4000;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Chance of each grade per bend. */
const BEND_PLAYERS: Record<string, Record<Grade, number>> = {
  perfect: { bullseye: 1, intune: 0, acceptable: 0, off: 0 },
  'very good': { bullseye: 0.55, intune: 0.35, acceptable: 0.08, off: 0.02 },
  good: { bullseye: 0.25, intune: 0.4, acceptable: 0.25, off: 0.1 },
  beginner: { bullseye: 0.12, intune: 0.3, acceptable: 0.33, off: 0.25 },
  'first try': { bullseye: 0.03, intune: 0.12, acceptable: 0.3, off: 0.55 },
};

const rng = new Rng(7);
const GRADES: Grade[] = ['bullseye', 'intune', 'acceptable', 'off'];
console.log('Bends (by ear, trace, scale), 10 a run');
for (const [who, p] of Object.entries(BEND_PLAYERS)) {
  const totals: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    let streak = NO_STREAK;
    let total = 0;
    for (let i = 0; i < BEND_PROMPTS; i++) {
      const grade = GRADES[rng.weighted(GRADES.map((g) => p[g]))];
      const s = scoreGrade(grade, streak);
      total += s.points;
      streak = s.streak;
    }
    totals.push(total);
  }
  console.log(`  ${who.padEnd(10)} ${Math.round(mean(totals)).toLocaleString('en-US')}`);
}

// --- triads -------------------------------------------------------------------
// A chord as a player plays it: how long it takes, how many wrong rakes first,
// and how good the move was (the bonus earned, as a share of the most).

interface TriadPlayer {
  /** Seconds per chord, about this and up to half again. */
  seconds: number;
  /** The chance of each wrong rake before the right one. */
  wrong: number;
  /** Chance of a full bonus, and of a partial one (moderate move, a step off, a fret wide). */
  full: number;
  part: number;
}

const TRIAD_PLAYERS: Record<string, TriadPlayer> = {
  perfect: { seconds: 2, wrong: 0, full: 1, part: 0 },
  'very good': { seconds: 3, wrong: 0.03, full: 0.85, part: 0.15 },
  good: { seconds: 5, wrong: 0.1, full: 0.6, part: 0.3 },
  beginner: { seconds: 9, wrong: 0.25, full: 0.35, part: 0.35 },
  'first try': { seconds: 20, wrong: 0.55, full: 0.2, part: 0.3 },
};

const CHORDS = 12;
const RAKES = 5;
for (const variant of ['progressions', 'targets', 'compact'] as const) {
  console.log(`Triads, ${variant}, ${CHORDS} chords`);
  for (const [who, pl] of Object.entries(TRIAD_PLAYERS)) {
    const totals: number[] = [];
    const shares: number[] = [];
    for (let r = 0; r < RUNS; r++) {
      const run = makeRun(rng, CHORDS);
      let streak = NO_STREAK;
      let total = 0;
      let possible = 0;
      let asked = 0;
      for (const p of run) {
        let compactShare = 0;
        let mult = 1;
        p.chords.forEach((_, i) => {
          asked++;
          const first = i === 0;
          const bonusMax = variant === 'progressions' ? (first ? 0 : SMOOTH_BONUS) : variant === 'targets' ? TARGET_BONUS : COMPACT_BONUS;
          possible += (TRIAD_BASE_POINTS + bonusMax) * topMultiplier(asked);
          let tries = 0;
          while (tries < RAKES && rng.next() < pl.wrong) tries++;
          if (tries > 0) streak = NO_STREAK;
          if (tries >= RAKES) return;
          const seconds = pl.seconds * (1 + 0.5 * rng.next()) + tries * 2;
          let points = timePoints(seconds);
          const roll = rng.next();
          const quality = roll < pl.full ? 1 : roll < pl.full + pl.part ? 0.4 : 0;
          if (variant === 'progressions' && !first) points += quality === 1 ? SMOOTH_BONUS : quality ? MODERATE_BONUS : 0;
          if (variant === 'targets') points = Math.max(0, points + targetPoints(quality === 1 ? 0 : quality ? 1 : 3));
          if (variant === 'compact') compactShare += quality;
          points = Math.round(points * streak.mult);
          mult = streak.mult;
          total += points;
          streak = stepStreak(streak, tries === 0 ? 'green' : 'ok');
        });
        if (variant === 'compact') {
          // The spread is judged once, for the whole progression.
          const extra = Math.round((1 - compactShare / p.chords.length) * 4);
          total += Math.round(compactPoints(extra, p.chords.length) * mult);
        }
      }
      totals.push(total);
      shares.push(total / possible);
    }
    console.log(`  ${who.padEnd(10)} ${Math.round(mean(totals)).toLocaleString('en-US').padStart(7)}   ${Math.round(mean(shares) * 100)}% of what was on offer`);
  }
}
