// Name That Fret: Speed Hunter the other way round. A fret lights, and its note
// is named on a row of keys under the board. The clock counts up while the
// name is being looked for, and a run is the total time for twenty frets.

import { blip, pluck, thud } from '../../audio/audio';
import type { BoardTouch } from '../../board/board';
import type { NoteRenderData } from '../../board/renderer';
import { formatSeconds, modeById, namerTargets, starsNamer } from '../../core/modes';
import { FLAT_NAMES, isNatural, pcName, SHARP_NAMES, type Spelling } from '../../core/music';
import { HUNT_PROMPTS_PER_WINDOW, makeNamePrompt, NAME_PENALTY, NAME_PROMPTS, type NamePrompt } from '../../core/notes';
import { Rng } from '../../core/rng';
import { el } from '../dom';
import { makeFrame, readyPanel, waiting } from '../game/frame';
import { showResult } from '../game/results';
import type { View } from '../router';
import { getSave } from '../store';
import { freshSeed } from '../ui';

/** How long an answer stays up before the next fret comes by itself. */
const NEXT_AFTER_MS = 1600;
/** A name this quick, in seconds, has its time shown in gold. */
const FAST_S = 1;
/** When the next fret comes at once, the gap that lets the last note fall silent first. */
const DAMP_S = 0.08;

export const namerView: View = (root, ctx) => {
  const mode = modeById('namer')!;
  const rng = new Rng(freshSeed());
  const accidentals = getSave().accidentals;
  /** How the answer is written once it is given: the setting's spelling, sharps where it says both. */
  const spelling: Spelling = accidentals === 'flat' ? 'flat' : 'sharp';

  let asked = 0;
  let named = 0;
  /** Seconds spent looking, over the prompts answered so far. */
  let looking = 0;
  let namedSeconds = 0;
  let penalty = 0;
  let streak = 0;
  let prompt: NamePrompt | null = null;
  /** performance.now() when the prompt went live, or 0 while none is. */
  let liveSince = 0;
  /** The last note sounded, to be stopped before the next. */
  let damp: () => void = () => undefined;

  const frame = makeFrame(root, ctx, mode.title, { onDown });
  const { board, tuning } = frame;
  board.panLocked = true;

  // The twelve keys: a natural is one name, the rest show both of theirs.
  const keys = SHARP_NAMES.map((sharp, pitchClass) => {
    const natural = isNatural(pitchClass);
    const key = el(
      `button.key${natural ? '' : '.black'}`,
      { type: 'button', onclick: () => answer(pitchClass) },
      natural ? el('b', {}, sharp) : [el('b', {}, sharp), el('b', {}, FLAT_NAMES[pitchClass])],
    ) as HTMLButtonElement;
    return key;
  });
  const keyRow = el('div.keys', {}, keys);
  frame.root.insertBefore(keyRow, frame.root.querySelector('.rotate'));
  const setKeys = (live: boolean) => {
    keyRow.classList.toggle('live', live);
    keys.forEach((k) => (k.disabled = !live));
  };
  setKeys(false);

  const count = () => `${Math.min(asked + 1, NAME_PROMPTS)} / ${NAME_PROMPTS}`;

  /** Clear the board, take a beat, then light the next fret. */
  async function next(counted = false): Promise<void> {
    if (asked >= NAME_PROMPTS) return finish();
    damp();
    board.setNotes([]);
    keys.forEach((k) => k.classList.remove('right', 'wrong'));
    frame.setPrompt(...waiting(count()));
    if (board.scrolls && asked % HUNT_PROMPTS_PER_WINDOW === 0) {
      let start = board.windowStart;
      for (let tries = 0; tries < 8 && Math.abs(start - board.windowStart) < 2; tries++) start = rng.int(board.layout.maxStart + 1);
      board.panTo(start);
      await board.whenSettled();
      if (frame.gone) return;
    }
    if (counted) present(DAMP_S);
    else frame.beat(() => present());
  }

  function present(delay = 0): void {
    const { first, last } = board.windowFrets;
    prompt = makeNamePrompt(rng, tuning, first, last, prompt);
    frame.setPrompt(el('span.caps', {}, count()), el('b.call.pop', {}, 'Name it'));
    asked++;
    const { cell } = prompt;
    board.setNotes([{ fret: cell.fret, stringIndex: cell.string, displayLabel: '?', fillColor: board.theme.orange, strokeColor: board.theme.orange, strokeWidth: 2 }]);
    board.flash(cell, board.theme.orange);
    // The fret sounds as it lights: the ear can help the eye.
    damp = pluck(prompt.midi, { level: 0.5, delay });
    liveSince = performance.now();
    setKeys(true);
  }

  function total(nowMs: number): number {
    return looking + penalty + (liveSince ? (nowMs - liveSince) / 1000 : 0);
  }

  function answer(pitchClass: number): void {
    if (!prompt || !liveSince) return;
    const seconds = (performance.now() - liveSince) / 1000;
    liveSince = 0;
    looking += seconds;
    setKeys(false);
    const { cell } = prompt;
    const right = pitchClass === prompt.pitchClass;
    const name = pcName(prompt.pitchClass, spelling);
    const mark: NoteRenderData = {
      fret: cell.fret,
      stringIndex: cell.string,
      displayLabel: name,
      fillColor: right ? board.theme.good : 'transparent',
      strokeColor: right ? board.theme.good : board.theme.orange,
      labelColor: right ? undefined : board.theme.orange,
      strokeWidth: 2,
    };
    keys[prompt.pitchClass].classList.add('right');
    if (right) {
      named++;
      namedSeconds += seconds;
      damp();
      damp = pluck(prompt.midi, { level: 0.55 });
      board.flash(cell, board.theme.good);
      frame.setStreak(++streak);
      frame.pop(`${seconds.toFixed(1)} s`, [cell], seconds < FAST_S ? 'gold' : 'good');
    } else {
      penalty += NAME_PENALTY;
      thud();
      keys[pitchClass].classList.add('wrong');
      board.flash(cell, board.theme.danger);
      frame.setStreak((streak = 0));
      frame.pop(`+${NAME_PENALTY} s`, [cell], 'bad');
      frame.banner('Miss', 'bad');
    }
    board.setNotes([mark]);
    frame.setClock(formatSeconds(total(0)));
    frame.offerNext((counted) => void next(counted), NEXT_AFTER_MS);
  }

  function onDown(touch: BoardTouch): void {
    // The board is only there to be read: a tap on it between frets moves on.
    if (frame.nextOffered) frame.takeNext(true);
    void touch;
  }

  frame.everyFrame((nowMs) => {
    if (liveSince) frame.setClock(formatSeconds(total(nowMs)));
  });

  function finish(): void {
    damp();
    board.setNotes([]);
    keyRow.remove();
    frame.setPrompt();
    const seconds = looking + penalty;
    showResult(
      frame,
      ctx,
      {
        mode,
        value: seconds,
        stars: starsNamer(seconds, NAME_PROMPTS),
        targets: namerTargets(NAME_PROMPTS),
        stats: [
          ['Named', `${named} / ${NAME_PROMPTS}`],
          ['Speed rating', named ? `${(namedSeconds / named).toFixed(2)} s a fret` : '—'],
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
    ['A fret lights up. Tap its note on the keys under the board; either spelling counts.', `${NAME_PROMPTS} frets; a wrong name adds ${NAME_PENALTY} s.`],
    namerTargets(NAME_PROMPTS),
    () => {
      blip();
      void next();
    },
  );

  return frame.teardown;
};
