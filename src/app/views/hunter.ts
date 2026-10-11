// Speed Hunter: a note is called; find it. The clock counts up while you look,
// and a run is the total time for twenty notes.

import { blip, pluck, thud } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { NoteRenderData } from '../../board/renderer';
import { formatSeconds, hunterTargets, modeById, rankHunter } from '../../core/modes';
import { cellMidi, pc, pcName, sameCell, stringName, type Cell } from '../../core/music';
import {
  HUNT_PENALTY,
  HUNT_PROMPTS,
  HUNT_PROMPTS_PER_WINDOW,
  makeHuntPrompt,
  type HuntPrompt,
  type HuntVariant,
} from '../../core/notes';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { makeFrame, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { getSave } from '../store';
import { freshSeed } from '../ui';

/** How long an answer stays up before the next note comes by itself. */
const NEXT_AFTER_MS = 2000;
/** A finger that travels this far between notes is swiping on to the next. */
const SWIPE_PX = 40;
/** A find this quick, in seconds, has its time shown in gold. */
const FAST_S = 1;

export const hunterView: View = (root, ctx) => {
  const wanted = ctx.params.variant;
  const variant: HuntVariant = wanted === 'advanced' ? wanted : 'name';
  const mode = modeById(`hunter-${variant}`)!;
  const rng = new Rng(freshSeed());
  const accidentals = getSave().accidentals;

  let asked = 0;
  let found = 0;
  /** Seconds spent looking, over the prompts answered so far. */
  let looking = 0;
  let foundSeconds = 0;
  let penalty = 0;
  /** Notes found in a row. */
  let streak = 0;
  let prompt: HuntPrompt | null = null;
  /** performance.now() when the prompt went live, or 0 while none is. */
  let liveSince = 0;
  /** A finger that came down between notes, and where. */
  let between: { id: number; x: number; y: number } | null = null;

  const frame = makeFrame(root, ctx, mode.title, { onDown, onMove, onUp });
  const { board, tuning } = frame;
  board.panLocked = true;

  const count = () => `${Math.min(asked + 1, HUNT_PROMPTS)} / ${HUNT_PROMPTS}`;

  function label(cell: Cell): string {
    return pcName(pc(cellMidi(tuning, cell)), prompt && prompt.name.includes('♭') ? 'flat' : 'sharp');
  }

  /**
   * Clear the board, take a beat, then call the next note. When the count ran
   * out by itself the wait has been had already, and the note comes at once.
   */
  async function next(counted = false): Promise<void> {
    if (asked >= HUNT_PROMPTS) return finish();
    board.setNotes([]);
    board.setGlowString(null);
    board.setGlowFret(null);
    frame.setPrompt(...waiting(count()));
    if (board.scrolls && asked % HUNT_PROMPTS_PER_WINDOW === 0) {
      // A long neck is hunted a stretch at a time: move somewhere else on it.
      let start = board.windowStart;
      for (let tries = 0; tries < 8 && Math.abs(start - board.windowStart) < 2; tries++) start = rng.int(board.layout.maxStart + 1);
      board.panTo(start);
      await board.whenSettled();
      if (frame.gone) return;
    }
    if (counted) present();
    else frame.beat(present);
  }

  function present(): void {
    const { first, last } = board.windowFrets;
    prompt = makeHuntPrompt(rng, tuning, variant, first, last, accidentals, prompt);
    // Where the prompt says to look, when it says: a string, or a fret.
    const where = prompt.string !== null ? `on the ${stringName(tuning, prompt.string)} string` : prompt.fret !== null ? `at fret ${prompt.fret}` : null;
    frame.setPrompt(
      el('span.caps', {}, count()),
      el('b.call.pop', {}, prompt.name),
      where ? el('span.call-sub', {}, where) : null,
    );
    asked++;
    if (prompt.string !== null) board.setGlowString(prompt.string);
    if (prompt.fret !== null) board.setGlowFret(prompt.fret);
    pluck(prompt.midi, { level: 0.5 });
    liveSince = performance.now();
  }

  function total(nowMs: number): number {
    return looking + penalty + (liveSince ? (nowMs - liveSince) / 1000 : 0);
  }

  /** The prompt is answered, rightly or not. Show where the note is and wait for the player. */
  function settle(cell: Cell, seconds: number): void {
    if (!prompt) return;
    liveSince = 0;
    looking += seconds;
    const right = prompt.answers.some((a) => sameCell(a, cell));
    const marks: NoteRenderData[] = prompt.answers.map((a) => {
      const tapped = right && sameCell(a, cell);
      return {
        fret: a.fret,
        stringIndex: a.string,
        displayLabel: label(a),
        fillColor: tapped ? board.theme.good : 'transparent',
        strokeColor: right ? board.theme.good : board.theme.orange,
        strokeWidth: 2,
        labelColor: tapped ? undefined : right ? board.theme.good : board.theme.orange,
        opacity: right && !tapped ? 0.55 : 1,
      };
    });
    if (right) {
      found++;
      foundSeconds += seconds;
      pluck(cellMidi(tuning, cell), { level: 0.55 });
      board.flash(cell, board.theme.good);
      frame.setStreak(++streak);
      frame.pop(`${seconds.toFixed(2)} s`, [cell], seconds < FAST_S ? 'gold' : 'good');
    } else {
      penalty += HUNT_PENALTY;
      thud();
      marks.push({ fret: cell.fret, stringIndex: cell.string, displayLabel: label(cell), fillColor: 'transparent', strokeColor: board.theme.danger, labelColor: board.theme.danger, xOverlay: true });
      board.flash(cell, board.theme.danger);
      frame.setStreak((streak = 0));
      frame.pop(`+${HUNT_PENALTY} s`, [cell], 'bad');
      frame.banner('Miss', 'bad');
    }
    board.setNotes(marks);
    frame.setClock(formatSeconds(total(0)));
    frame.offerNext((counted) => void next(counted), NEXT_AFTER_MS);
  }

  function onDown(touch: BoardTouch): void {
    // Between notes a touch is not an answer: it holds the count, or swipes past it.
    if (frame.nextOffered) {
      between = { id: touch.id, x: touch.x, y: touch.y };
      return;
    }
    if (!liveSince || !touch.cell) return;
    settle(touch.cell, (touch.time - liveSince) / 1000);
  }

  function onMove(touch: BoardTouch): void {
    if (between?.id !== touch.id || Math.hypot(touch.x - between.x, touch.y - between.y) < SWIPE_PX) return;
    between = null;
    frame.takeNext();
  }

  function onUp(touch: BoardTouch): void {
    if (between?.id !== touch.id) return;
    between = null;
    frame.holdNext();
  }

  frame.everyFrame((nowMs) => {
    if (liveSince) frame.setClock(formatSeconds(total(nowMs)));
  });

  function finish(): void {
    board.setNotes([]);
    board.setGlowString(null);
    board.setGlowFret(null);
    frame.setPrompt();
    const seconds = looking + penalty;
    showResult(
      frame,
      ctx,
      {
        mode,
        value: seconds,
        rank: rankHunter(seconds, HUNT_PROMPTS, variant === 'advanced'),
        targets: hunterTargets(HUNT_PROMPTS, variant === 'advanced'),
        stats: [
          ['Found', `${found} / ${HUNT_PROMPTS}`],
          ['Speed rating', found ? `${(foundSeconds / found).toFixed(2)} s a note` : '—'],
          ['Penalty', `${penalty} s`],
        ],
      },
      () => ctx.replace(mode.route),
    );
  }

  frame.root.classList.add('no-score');
  frame.setClock(formatSeconds(0));
  frame.setPrompt(el('span.caps', {}, mode.variant));
  readyPanel(
    frame,
    `${mode.title} · ${mode.variant}`,
    [
      variant === 'name'
        ? 'A note name is called. Tap any fret that plays it, or its open string beside the nut.'
        : 'A note is called with a string or a fret to find it on, which lights up. Only there will do: the same note anywhere else is a miss.',
      `The clock runs only while you look. ${HUNT_PROMPTS} notes; a wrong fret adds ${HUNT_PENALTY} seconds.`,
      'The next note comes after two seconds. Tap the board to hold it there; swipe, or press Next, to go at once.',
    ],
    hunterTargets(HUNT_PROMPTS, variant === 'advanced'),
    () => {
      blip();
      void next();
    },
  );

  return frame.teardown;
};
