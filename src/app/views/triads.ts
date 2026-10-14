// Triads, two games on one input.
//
// Progressions: a run of chord changes; each chord is built on three
// neighbouring strings and raked. Points are for speed and for moving the hand
// as little as possible from the last chord. In the Targets game a fret, a
// string or both are lit instead, and the points are for playing near them. In
// the Compact game they are for holding a whole progression across few frets.
//
// Grid clear: one chord; find every close voicing of it on the neck.

import { blip, buzz, strum } from '../../audio/audio';
import type { LineData, NoteRenderData } from '../../board/renderer';
import { formatSeconds, gridTargets, modeById, rankGrid, rankTriads, triadTargets } from '../../core/modes';
import { allCells, cellKey, cellMidi, pc, pcName, stringName, type Cell } from '../../core/music';
import { Rng } from '../../core/rng';
import { formatMultiplier, GREEN_STEP, NO_STREAK, stepStreak, topMultiplier } from '../../core/streak';
import {
  checkVoicing,
  chordName,
  chordTones,
  closestToTarget,
  COMPACT_BONUS,
  compactPoints,
  displacement,
  enumerateVoicings,
  keepers,
  likeliest,
  makeRun,
  makeTarget,
  motionBonus,
  motionOf,
  SMOOTH_BONUS,
  spreadOf,
  TARGET_BONUS,
  TARGET_STEP,
  tightestSpread,
  targetDistance,
  targetPoints,
  timePoints,
  toneLabel,
  TRIAD_BASE_POINTS,
  voicingKey,
  type Chord,
  type Target,
  type Voicing,
} from '../../core/triads';
import { el } from '../dom';
import { makeFrame, panelOption, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import { TriadInput } from '../game/triadInput';
import type { View } from '../router';
import { updateSave } from '../store';
import { freshSeed, segmented } from '../ui';

/** A run of progressions ends once this many chords have been asked. */
const CHORDS_PER_RUN = 12;
/** Seconds added to the grid-clear clock for raking something that is not the chord. */
const GRID_PENALTY = 3;
/** In progressions, the wrong rake at which the chord is given away. */
const RAKES_BEFORE_ANSWER = 5;
/** Once a progression's last chord is in, the wait before it is played back whole, and the time each chord of it gets. */
const REPLAY_AFTER_MS = 900;
const REPLAY_BEAT_MS = 520;

/** A chord tone as it is written on a note: 'b3' is "♭3", 'd5' is "♭5". */
function toneText(label: string): string {
  return label.replace('b', '♭').replace('d5', '♭5');
}

/** The three notes of a voicing that has been played, labelled and coloured by chord tone. */
function playedNotes(voicing: readonly Cell[], labels: readonly string[], opacity = 1): NoteRenderData[] {
  return voicing.map((c, i) => ({
    fret: c.fret,
    stringIndex: c.string,
    intervalLabel: labels[i],
    displayLabel: toneText(labels[i]),
    opacity,
  }));
}

function outline(voicing: readonly Cell[], color: string, opacity: number, dashed = false): LineData[] {
  return [
    { from: voicing[0], to: voicing[1], color, opacity, dashed, strokeWidth: 2 },
    { from: voicing[1], to: voicing[2], color, opacity, dashed, strokeWidth: 2 },
  ];
}

export const triadsView: View = (root, ctx) => {
  const variant = ctx.params.variant === 'target' || ctx.params.variant === 'compact' ? ctx.params.variant : 'standard';
  const targets = variant === 'target';
  const compact = variant === 'compact';
  const mode = modeById(variant === 'standard' ? 'triads' : `triads-${variant}`)!;
  // The menu's Play button comes back to the game last played.
  updateSave((s) => ({ ...s, picks: { ...s.picks, triads: variant } }));
  const rng = new Rng(freshSeed());

  const progressions = makeRun(rng, CHORDS_PER_RUN);
  const total = CHORDS_PER_RUN;

  let pIndex = 0;
  let cIndex = 0;
  let asked = 0;
  let score = 0;
  let possible = 0;
  let wrong = 0;
  let moved = 0;
  let moves = 0;
  let decided = 0;
  /** Chords played in a row, and the multiplier they give: a chord with no wrong rake steps it up a quarter, one found after wrong rakes a tenth. */
  let streak = NO_STREAK;
  /** performance.now() when the chord was put up, or 0 between chords. */
  let since = 0;
  /** The last chord played in this progression, and its labels. */
  let previous: { voicing: Voicing; labels: string[] } | null = null;
  let shown: NoteRenderData[] = [];
  /** Once a chord is played: its notes everywhere else on the neck, as rings. */
  let toneRings: NoteRenderData[] = [];
  /** Every way to play the chord that is up. */
  let answers: Voicing[] = [];
  /** Wrong rakes at the chord that is up. */
  let tries = 0;
  /** Notes of a wrong rake that were right, by cell: they stay chosen, and say which chord tone they are. */
  let kept = new Set<string>();
  /** Chords given away after too many wrong rakes. */
  let given = 0;
  /** In the Targets game: what is lit for the chord that is up, the nearest it can be played to it, and the steps missed by so far. */
  let target: Target | null = null;
  let reachable = 0;
  let missedBy = 0;
  /** In the Compact game: the chords played so far in this progression, and the frets wider than needed so far in the run. */
  let held: Voicing[] = [];
  let wider = 0;
  /** The chords played so far in this progression, as they were played: heard back whole once it is done. */
  let played: { voicing: Voicing; labels: string[] }[] = [];
  /** Counts up whenever a playback is cut short, so its chords still to come are dropped. */
  let replays = 0;

  const frame = makeFrame(root, ctx, mode.title, {
    onDown: (t) => {
      if (!frame.takeNext(true)) input.down(t);
    },
    onMove: (t) => input.move(t),
    onUp: (t) => input.up(t),
  });
  const { board, tuning } = frame;
  const input = new TriadInput(board, tuning, paintBoard, rake);

  function chord(): Chord {
    return progressions[pIndex].chords[cIndex];
  }

  function paintPrompt(): void {
    const p = progressions[pIndex];
    frame.setPrompt(
      el('span.caps', {}, `${p.keyName} · ${asked} / ${total}`),
      el(
        'span.chips',
        {},
        p.chords.map((c, i) =>
          el(`span.chip${i === cIndex ? '.now' : i < cIndex ? '.done' : ''}`, {}, el('b', {}, chordName(c, p.spelling)), el('i', {}, p.roman[i])),
        ),
      ),
      // After a wrong rake the chord is spelled out.
      tries > 0 ? el('span.call-sub', {}, chordTones(chord()).map((t) => pcName(t, p.spelling)).join(' · ')) : null,
      target ? el('span.call-sub', {}, targetWords(target)) : null,
      compact && held.length ? el('span.call-sub', {}, spreadWords(held)) : null,
    );
  }

  /** Where the target is, in words: "at fret 7", "on the G string", "on the G string at fret 7". */
  function targetWords(t: Target): string {
    const on = t.string === null ? '' : `on the ${stringName(tuning, t.string)} string`;
    const at = t.fret === null ? '' : `at fret ${t.fret}`;
    return [on, at].filter(Boolean).join(' ');
  }

  /** The frets held so far: "frets 3–7", or "fret 5", or "open strings". */
  function spreadWords(voicings: readonly Voicing[]): string {
    const frets = voicings.flatMap((v) => v.map((c) => c.fret)).filter((f) => f > 0);
    if (!frets.length) return 'open strings';
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    return lo === hi ? `fret ${lo}` : `frets ${lo}–${hi}`;
  }

  /**
   * The last chord of a progression is in: in the Compact game, score how
   * tightly the whole of it was held, against the tightest it could have been.
   */
  function closeProgression(mult = 1): { points: number; words: string } {
    const p = progressions[pIndex];
    if (!compact || cIndex !== p.chords.length - 1) return { points: 0, words: '' };
    const spread = spreadOf(held);
    const tightest = tightestSpread(p.chords.map((c) => enumerateVoicings(tuning, c, 0, frame.frets)));
    const extra = Math.max(0, spread - tightest);
    wider += extra;
    const points = Math.round(compactPoints(extra, p.chords.length) * mult);
    const words = extra === 0 ? `As tight as it gets · ${spread} frets` : `${spread} frets, ${tightest} possible`;
    return { points, words: `${words} · +${points}` };
  }

  function paintTarget(): void {
    board.setGlowString(target?.string ?? null);
    board.setGlowFret(target?.fret ?? null);
  }

  function paintBoard(): void {
    const notes: NoteRenderData[] = [...toneRings, ...shown];
    const lines: LineData[] = [];
    if (compact && shown.length === 0) {
      // The rest of the progression so far, fainter: the frets it is held across.
      for (const v of held.slice(0, -1)) {
        notes.push(...v.map((c) => ({ fret: c.fret, stringIndex: c.string, fillColor: board.theme.muted, opacity: 0.22, radiusScale: 0.6 })));
        lines.push(...outline(v, board.theme.muted, 0.3, true));
      }
    }
    if (previous && shown.length === 0) {
      // Where the hand was: the place to move from.
      notes.push(...playedNotes(previous.voicing, previous.labels, 0.28));
      lines.push(...outline(previous.voicing, board.theme.muted, 0.5, true));
    }
    for (const c of input.selected) {
      // A note kept from a wrong rake is known to be right, and says what it is to the chord.
      const tone = kept.has(cellKey(c)) ? toneLabel(chord(), pc(cellMidi(tuning, c))) : null;
      if (tone) {
        const good = board.theme.good;
        notes.push({ fret: c.fret, stringIndex: c.string, displayLabel: toneText(tone), fillColor: board.theme.panel, strokeColor: good, labelColor: good, strokeWidth: 3, glow: good });
      } else {
        notes.push({ fret: c.fret, stringIndex: c.string, fillColor: 'transparent', strokeColor: board.theme.cyan, strokeWidth: 3, glow: board.theme.cyan });
      }
    }
    board.setNotes(notes);
    board.setLines(lines);
  }

  /**
   * Every other place on the neck the chord's notes can be played, hollow and
   * named by chord tone, so the shape is seen among the rest of the chord.
   */
  function chordRings(voicing: Voicing): NoteRenderData[] {
    const played = new Set(voicing.map(cellKey));
    const theme = board.theme;
    const out: NoteRenderData[] = [];
    for (const c of allCells(tuning, 0, frame.frets)) {
      const tone = played.has(cellKey(c)) ? null : toneLabel(chord(), pc(cellMidi(tuning, c)));
      if (!tone) continue;
      const color = tone === 'R' ? theme.pivot : theme.cyan;
      out.push({
        fret: c.fret,
        stringIndex: c.string,
        displayLabel: toneText(tone),
        fillColor: 'transparent',
        strokeColor: color,
        strokeWidth: tone === 'R' ? 2.5 : 1.5,
        labelColor: color,
        opacity: 0.6,
        radiusScale: 0.8,
      });
    }
    return out;
  }

  function present(): void {
    asked++;
    shown = [];
    toneRings = [];
    tries = 0;
    kept = new Set();
    answers = enumerateVoicings(tuning, chord(), 0, frame.frets);
    if (targets) {
      // A fret somewhere on the neck as it is shown, past the nut.
      const { first, last } = board.windowFrets;
      target = makeTarget(rng, tuning.open.length, Math.max(1, first), last);
      reachable = closestToTarget(target, answers);
      paintTarget();
    }
    input.clear();
    input.enabled = true;
    // What a run with no wrong rake would have won here, at the multiplier it would have reached.
    possible += (TRIAD_BASE_POINTS + (targets ? TARGET_BONUS : compact ? COMPACT_BONUS : previous ? SMOOTH_BONUS : 0)) * topMultiplier(asked);
    paintPrompt();
    paintBoard();
    since = performance.now();
  }

  function showStreak(): void {
    frame.setStreak(streak.run, formatMultiplier(streak.mult), CHORDS_PER_RUN - 1);
  }

  /** The chord is over, played or given away: stop its clock. */
  function stopClock(): number {
    const seconds = (performance.now() - since) / 1000;
    since = 0;
    input.enabled = false;
    frame.setClock(`${seconds.toFixed(1)} s`);
    decided += seconds;
    return seconds;
  }

  /** A wrong rake: keep what was right of it, spell the chord, and after enough of them give the answer. */
  function miss(cells: Cell[], reason: string): void {
    wrong++;
    tries++;
    streak = NO_STREAK;
    showStreak();
    buzz();
    if (tries >= RAKES_BEFORE_ANSWER) return giveAnswer(cells);
    kept = new Set(keepers(cells, answers, previous?.voicing ?? null).map(cellKey));
    cells.forEach((c) => board.flash(c, kept.has(cellKey(c)) ? board.theme.good : board.theme.danger));
    input.selected = input.selected.filter((c) => kept.has(cellKey(c)));
    const left = RAKES_BEFORE_ANSWER - tries;
    frame.banner(`${reason} · ${left} ${left === 1 ? 'try' : 'tries'} left`, 'bad');
    paintPrompt();
    paintBoard();
  }

  /** Too many wrong rakes: show the way to play the chord that the last one was nearest to, for no points. */
  function giveAnswer(attempt: Cell[]): void {
    const voicing = likeliest(attempt, answers, previous?.voicing ?? attempt)!;
    stopClock();
    given++;
    strum(voicing.map((c) => cellMidi(tuning, c)), 0.03, { level: 0.45, ring: 1.1, delay: 0.35 });
    held.push(voicing);
    const close = closeProgression();
    score += close.points;
    frame.setScore(score);
    frame.banner(close.words ? `The answer · ${close.words}` : 'The answer · +0', 'info');
    settle(voicing, checkVoicing(tuning, voicing, chord()).labels!);
  }

  function rake(cells: Cell[]): void {
    if (!since) return;
    const check = checkVoicing(tuning, cells, chord());
    if (!check.ok) return miss(cells, check.reason ?? 'Not the chord');
    const seconds = stopClock();
    const voicing = check.voicing!;
    strum(voicing.map((c) => cellMidi(tuning, c)), 0.03, { level: 0.5, ring: 1.1 });

    let points = timePoints(seconds);
    let words = '';
    if (target) {
      // Steps further from the target than the chord had to be.
      const off = targetDistance(target, voicing) - reachable;
      missedBy += off;
      points = Math.max(0, points + targetPoints(off));
      words = off === 0 ? 'On target · ' : `${off} ${off === 1 ? 'step' : 'steps'} off · `;
    } else if (compact) {
      held.push(voicing);
    } else if (previous) {
      const mean = displacement(previous.voicing, voicing);
      const motion = motionOf(mean);
      moved += mean;
      moves++;
      points += motionBonus(motion);
      words = motion === 'smooth' ? 'Smooth voice leading · ' : motion === 'leap' ? 'Neck leap · ' : '';
    }
    // Scored at the multiplier the chord found, which only then moves.
    points = Math.round(points * streak.mult);
    const close = closeProgression(streak.mult);
    score += points + close.points;
    frame.setScore(score);
    streak = stepStreak(streak, tries === 0 ? 'green' : 'ok');
    showStreak();
    frame.pop(`+${points.toLocaleString('en-US')}`, voicing, 'good');
    // The progression's bonus comes up after, in gold, so the two are read apart.
    if (close.points) frame.later(320, () => frame.pop(`+${close.points.toLocaleString('en-US')}`, voicing, 'gold'));
    const said = close.words || words.replace(/ · $/, '');
    if (said) frame.banner(said, 'good');
    settle(voicing, check.labels!);
  }

  /** Leave the chord on the board, each note marked as the root or its distance from it, and wait for the player. */
  function settle(voicing: Voicing, labels: string[]): void {
    shown = playedNotes(voicing, labels);
    toneRings = chordRings(voicing);
    input.selected = [];
    kept = new Set();
    paintBoard();
    board.setLines(outline(voicing, board.theme.cyan, 0.6));
    previous = { voicing, labels };
    played.push(previous);
    if (cIndex === progressions[pIndex].chords.length - 1) replay(played);

    frame.offerNext(() => {
      replays++;
      cIndex++;
      if (cIndex >= progressions[pIndex].chords.length) {
        pIndex++;
        cIndex = 0;
        // A new progression starts from nowhere: no move to judge.
        previous = null;
        held = [];
        played = [];
        if (pIndex < progressions.length) blip(1760, 0.07);
      }
      if (pIndex >= progressions.length) return finish();
      target = null;
      paintTarget();
      shown = [];
      toneRings = [];
      input.selected = [];
      paintBoard();
      frame.setClock('');
      frame.setPrompt(...waiting(`${progressions[pIndex].keyName} · ${asked + 1} / ${total}`));
      frame.beat(present);
    });
  }

  /**
   * The progression is done: play it back, a chord a beat, each lit on the
   * board as it sounds, so it is heard as the run of changes it is. Moving on
   * cuts it short.
   */
  function replay(chords: readonly { voicing: Voicing; labels: string[] }[]): void {
    const id = ++replays;
    const last = chords[chords.length - 1];
    chords.forEach((c, i) => {
      frame.later(REPLAY_AFTER_MS + i * REPLAY_BEAT_MS, () => {
        if (id !== replays) return;
        const end = i === chords.length - 1;
        strum(c.voicing.map((n) => cellMidi(tuning, n)), 0.025, { level: 0.45, ring: end ? 1.4 : 0.7 });
        board.setNotes(playedNotes(c.voicing, c.labels));
        board.setLines(outline(c.voicing, board.theme.cyan, 0.6));
      });
    });
    // Then the board as it was left: the last chord among its rings.
    frame.later(REPLAY_AFTER_MS + chords.length * REPLAY_BEAT_MS, () => {
      if (id !== replays) return;
      paintBoard();
      board.setLines(outline(last.voicing, board.theme.cyan, 0.6));
    });
  }

  // The time taken over this chord, counting up.
  frame.everyFrame((nowMs) => {
    if (since) frame.setClock(`${((nowMs - since) / 1000).toFixed(1)} s`);
  });

  function finish(): void {
    board.setNotes([]);
    board.setLines([]);
    target = null;
    paintTarget();
    frame.setPrompt();
    showResult(
      frame,
      ctx,
      {
        mode,
        value: score,
        rank: rankTriads(score, possible),
        targets: triadTargets(possible),
        stats: [
          targets
            ? ['Off target', `${(missedBy / Math.max(1, total - given)).toFixed(1)} steps`]
            : compact
              ? ['Wider than needed', `${(wider / progressions.length).toFixed(1)} frets`]
              : ['Voice leading', moves ? `${(moved / moves).toFixed(1)} frets` : '—'],
          ['Speed rating', `${(decided / total).toFixed(1)} s`],
          ['Wrong rakes', String(wrong)],
          ['Answers shown', String(given)],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  // Each chord is timed: keep the clock's room in the bar from the start.
  frame.setClock('');
  frame.setPrompt(el('span.caps', {}, mode.variant));
  board.centreOn(7, true);
  readyPanel(
    frame,
    `${mode.title} · ${mode.variant}`,
    [
      'Tap a fret on three neighbouring strings, then drag to play. Points for speed.',
      targets
        ? `Play near the lit fret or string: ${TARGET_STEP} off per step away.`
        : compact
          ? `Up to ${COMPACT_BONUS} a chord for a progression held in few frets.`
          : 'A bonus for staying close to the chord before.',
      `Clean chords add ×${GREEN_STEP}; the ${RAKES_BEFORE_ANSWER}th wrong rake shows the answer.`,
    ],
    triadTargets(),
    () => {
      frame.setPrompt(...waiting(`${progressions[0].keyName} · 1 / ${total}`));
      frame.beat(present);
    },
    panelOption(
      'Game',
      segmented<string>(
        [
          { value: 'triads', label: 'Progressions' },
          { value: 'triads-target', label: 'Targets' },
          { value: 'triads-compact', label: 'Compact' },
        ],
        mode.id,
        (id) => {
          // Each is its own game, with its own score table: build it afresh.
          ctx.replace(modeById(id)!.route);
        },
      ),
    ),
  );

  return frame.teardown;
};

export const gridClearView: View = (root, ctx) => {
  const mode = modeById('gridclear')!;
  const rng = new Rng(freshSeed());

  const frame = makeFrame(root, ctx, mode.title, {
    onDown: (t) => input.down(t),
    onMove: (t) => input.move(t),
    onUp: (t) => input.up(t),
  });
  const { board, tuning } = frame;
  const input = new TriadInput(board, tuning, paintBoard, rake);

  const target: Chord = { root: rng.int(12), quality: rng.next() < 0.5 ? 'maj' : 'min' };
  const name = `${pcName(target.root, rng.next() < 0.5 ? 'sharp' : 'flat')} ${target.quality === 'maj' ? 'major' : 'minor'}`;
  const all = enumerateVoicings(tuning, target, 0, frame.frets);
  const found = new Map<string, { voicing: Voicing; labels: string[] }>();

  let startedAt = 0;
  let penalty = 0;
  let wrong = 0;
  let streak = 0;

  function paintPrompt(): void {
    frame.setPrompt(el('b.call', {}, name), el('span.call-sub', {}, `${found.size} / ${all.length} found`));
  }

  function paintBoard(): void {
    const notes: NoteRenderData[] = [];
    const lines: LineData[] = [];
    for (const { voicing, labels } of found.values()) {
      // Found shapes stay on the board, dimmed. Their frets stay in play:
      // neighbouring shapes share them.
      notes.push(...playedNotes(voicing, labels, 0.3).map((n) => ({ ...n, radiusScale: 0.72 })));
      lines.push(...outline(voicing, board.theme.muted, 0.55));
    }
    for (const c of input.selected) {
      notes.push({ fret: c.fret, stringIndex: c.string, fillColor: 'transparent', strokeColor: board.theme.cyan, strokeWidth: 3, glow: board.theme.cyan });
    }
    board.setNotes(notes);
    board.setLines(lines);
  }

  function seconds(nowMs: number): number {
    return (nowMs - startedAt) / 1000 + penalty;
  }

  function rake(cells: Cell[]): void {
    if (!startedAt) return;
    const check = checkVoicing(tuning, cells, target);
    if (!check.ok) {
      wrong++;
      penalty += GRID_PENALTY;
      buzz();
      cells.forEach((c) => board.flash(c, board.theme.danger));
      frame.setStreak((streak = 0));
      frame.pop(`+${GRID_PENALTY} s`, cells, 'bad');
      frame.banner(check.reason ?? 'Not the chord', 'bad');
      return;
    }
    const key = voicingKey(check.voicing!);
    strum(check.voicing!.map((c) => cellMidi(tuning, c)), 0.03, { level: 0.5, ring: 0.9 });
    if (found.has(key)) {
      frame.banner('Already found', 'info');
      input.clear();
      return;
    }
    found.set(key, { voicing: check.voicing!, labels: check.labels! });
    frame.setStreak(++streak);
    frame.banner(`${check.inversion === 'Root' ? 'Root position' : `${check.inversion} inversion`}`, 'good');
    input.clear();
    paintPrompt();
    if (found.size >= all.length) finish(seconds(performance.now()));
  }

  frame.everyFrame((nowMs) => {
    if (startedAt) frame.setClock(formatSeconds(seconds(nowMs)));
  });

  function finish(total: number): void {
    startedAt = 0;
    input.enabled = false;
    frame.setClock(formatSeconds(total));
    showResult(
      frame,
      ctx,
      {
        mode,
        value: total,
        rank: rankGrid(total, all.length),
        targets: gridTargets(all.length),
        stats: [
          ['Chord', name],
          ['Voicings', String(all.length)],
          ['Wrong rakes', String(wrong)],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.root.classList.add('no-score');
  frame.setClock(formatSeconds(0));
  frame.setPrompt(el('span.caps', {}, mode.variant));
  board.centreOn(7, true);
  readyPanel(
    frame,
    `${mode.title} · ${mode.variant}`,
    [
      'Find every close voicing of one chord: each inversion on every string set, open strings included.',
      `Tap a fret per string, then drag to play. A wrong rake adds ${GRID_PENALTY} s.`,
    ],
    gridTargets(all.length),
    () => {
      frame.setPrompt(el('b.call.wait', {}, '· · ·'));
      frame.beat(() => {
        startedAt = performance.now();
        input.enabled = true;
        paintPrompt();
        paintBoard();
      });
    },
  );

  return frame.teardown;
};
