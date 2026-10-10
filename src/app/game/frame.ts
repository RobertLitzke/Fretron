// What every game screen is built from: a slim row of score and prompt, the
// board under it, and panels that sit over the board before and after a run.

import { unlock } from '../../audio/audio';
import { Board, type BoardOptions } from '../../board/board';
import { STANDARD_TUNING, type Tuning } from '../../core/music';
import { el, type Child } from '../dom';
import type { ViewContext } from '../router';
import { getSave } from '../store';

/** The pause between asking for the next prompt and getting it, in milliseconds. */
export const BEAT_MS = 550;
/** A tap on the board this soon after an answer is the answer's own bounce, not "next". */
const NEXT_GUARD_MS = 280;
/** How long the quit button waits for its second press before it goes back to being a cross. */
const QUIT_ARMED_MS = 2500;

export interface Frame {
  root: HTMLElement;
  board: Board;
  tuning: Tuning;
  /** How many frets the neck has, from the settings. */
  frets: number;
  setScore(points: number): void;
  /** The streak multiplier, or null to hide it. */
  setCombo(combo: number | null): void;
  setPrompt(...children: Child[]): void;
  setClock(text: string): void;
  /** A button at the end of the top row, or none. */
  setAction(label: string | null, run?: () => void): void;
  /**
   * A prompt is over: wait for the player before the next. Shows a Next button;
   * the space bar and Enter press it, and a view passes a tap on the board to
   * takeNext so that anywhere on the board does too.
   *
   * With `autoMs` the next comes by itself after that long, the button
   * draining as it goes, unless holdNext stops the count. `run` is told
   * whether it was the count that ran out.
   */
  offerNext(run: (auto: boolean) => void, autoMs?: number): void;
  /** Move on if a next is on offer. Returns whether it was. */
  takeNext(fromBoard?: boolean): boolean;
  /** Whether a next is on offer. */
  readonly nextOffered: boolean;
  /** Stop the count to an automatic next, or start it again from where it stopped. */
  holdNext(): void;
  /** Run `fn` after a beat: the pause that comes before every prompt. */
  beat(fn: () => void): void;
  /** A word or two over the board that fades by itself. */
  banner(text: string, kind?: 'good' | 'bad' | 'info'): void;
  /** A panel over the board. */
  panel(...children: Child[]): HTMLElement;
  clearPanel(): void;
  /** Run `fn` every animation frame until the screen is left. */
  everyFrame(fn: (nowMs: number) => void): void;
  /** Run `fn` after a pause, unless the screen has been left by then. */
  later(ms: number, fn: () => void): void;
  /** True once the screen has been left: late callbacks should do nothing. */
  readonly gone: boolean;
  teardown(): void;
}

type Handlers = Pick<BoardOptions, 'onDown' | 'onMove' | 'onUp' | 'onWindow'>;

export function makeFrame(root: HTMLElement, ctx: ViewContext, title: string, handlers: Handlers): Frame {
  const save = getSave();
  const tuning = STANDARD_TUNING;
  const board = new Board({ hand: save.hand, tuning, frets: save.frets, ...handlers });

  const score = el('b.num', {}, '0');
  const combo = el('span.hud-combo', { hidden: true });
  const prompt = el('div.hud-prompt');
  const clock = el('span.hud-clock.num');
  const action = el('button.btn.btn-small.hud-action', { type: 'button', hidden: true }) as HTMLButtonElement;
  const banners = el('div.banners');
  const panelHost = el('div.panel-host', { hidden: true });

  let actionRun: (() => void) | undefined;
  action.addEventListener('click', () => actionRun?.());

  const quit = el('button.hud-quit', { type: 'button', 'aria-label': 'Quit to the menu' }, '✕');
  let quitArmed = false;
  quit.addEventListener('click', () => {
    // With no panel up a run is under way, and the button is a thumb's width
    // from the top string: the first press only asks.
    if (panelHost.hidden && !quitArmed) {
      quitArmed = true;
      quit.textContent = 'Quit?';
      quit.classList.add('armed');
      later(QUIT_ARMED_MS, () => {
        quitArmed = false;
        quit.textContent = '✕';
        quit.classList.remove('armed');
      });
      return;
    }
    ctx.navigate('/home');
  });

  const hud = el(
    'header.hud',
    {},
    quit,
    el('span.hud-title', {}, title),
    el('span.hud-score', {}, el('span.caps', {}, 'Score'), score),
    combo,
    prompt,
    clock,
    action,
  );

  const game = el(
    'div.game',
    {},
    hud,
    el('div.stage', {}, board.root, banners, panelHost),
    el('div.rotate', {}, el('b', {}, 'Turn your phone sideways'), el('span', {}, 'The board is played in landscape.')),
  );
  root.replaceChildren(game);
  document.body.classList.add('in-game');

  let gone = false;

  // Keep the screen on while a game is up, where the browser can.
  let wakeLock: { release: () => Promise<void> } | null = null;
  const wake = (navigator as Navigator & { wakeLock?: { request: (kind: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  wake?.request('screen').then(
    (lock) => {
      if (gone) void lock.release();
      else wakeLock = lock;
    },
    () => undefined,
  );

  let pendingNext: ((auto: boolean) => void) | null = null;
  let offeredAt = 0;
  /** The count to an automatic next: how long it is, how much is left, and whether it is held. All 0 when there is none. */
  let autoMs = 0;
  let autoLeft = 0;
  let autoHeld = false;

  const setAction = (label: string | null, run?: () => void) => {
    action.hidden = label === null;
    action.textContent = label ?? '';
    action.classList.remove('btn-primary', 'counting', 'held');
    actionRun = run;
  };

  const takeNext = (fromBoard = false, auto = false): boolean => {
    if (!pendingNext) return false;
    // Still counts as taken: the tap must not go on to mean something else.
    if (fromBoard && performance.now() - offeredAt < NEXT_GUARD_MS) return true;
    const run = pendingNext;
    pendingNext = null;
    autoMs = 0;
    setAction(null);
    run(auto);
    return true;
  };

  let raf = 0;
  let lastFrame = 0;
  const frameFns: ((nowMs: number) => void)[] = [];
  const timers = new Set<number>();
  const loop = (nowMs: number) => {
    if (gone) return;
    raf = requestAnimationFrame(loop);
    // A tab that was away comes back with one long frame: do not spend the count on it.
    const dt = Math.min(100, nowMs - (lastFrame || nowMs));
    lastFrame = nowMs;
    if (pendingNext && autoMs && !autoHeld) {
      autoLeft -= dt;
      action.style.setProperty('--left', String(Math.max(0, autoLeft / autoMs)));
      if (autoLeft <= 0) takeNext(false, true);
    }
    for (const fn of frameFns) fn(nowMs);
  };
  raf = requestAnimationFrame(loop);

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!gone) fn();
    }, ms);
    timers.add(id);
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && pendingNext) {
      e.preventDefault();
      takeNext();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    root: game,
    board,
    tuning,
    frets: save.frets,
    setScore(points) {
      score.textContent = Math.round(points).toLocaleString('en-US');
    },
    setCombo(value) {
      combo.hidden = value === null;
      if (value !== null) {
        combo.textContent = `×${value}`;
        combo.classList.toggle('hot', value > 1);
      }
    },
    setPrompt(...children) {
      prompt.replaceChildren(el('span', {}, ...children));
    },
    setClock(text) {
      clock.textContent = text;
    },
    setAction,
    offerNext(run, auto = 0) {
      pendingNext = run;
      offeredAt = performance.now();
      setAction('Next ▸', () => takeNext());
      action.classList.add('btn-primary');
      autoMs = autoLeft = auto;
      autoHeld = false;
      if (auto) {
        action.style.setProperty('--left', '1');
        action.classList.add('counting');
      }
    },
    takeNext,
    get nextOffered() {
      return pendingNext !== null;
    },
    holdNext() {
      if (!pendingNext || !autoMs) return;
      autoHeld = !autoHeld;
      action.classList.toggle('held', autoHeld);
      action.textContent = autoHeld ? 'Held · Next ▸' : 'Next ▸';
    },
    beat(fn) {
      later(BEAT_MS, fn);
    },
    banner(text, kind = 'info') {
      const node = el(`div.banner.${kind}`, {}, text);
      // One at a time: the newest word replaces the last.
      banners.replaceChildren(node);
      node.addEventListener('animationend', () => node.remove());
    },
    panel(...children) {
      const node = el('div.panel', {}, ...children);
      panelHost.replaceChildren(node);
      panelHost.hidden = false;
      return node;
    },
    clearPanel() {
      panelHost.hidden = true;
      panelHost.replaceChildren();
    },
    everyFrame(fn) {
      frameFns.push(fn);
    },
    later,
    get gone() {
      return gone;
    },
    teardown() {
      gone = true;
      pendingNext = null;
      cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
      window.removeEventListener('keydown', onKey);
      board.destroy();
      void wakeLock?.release();
      document.body.classList.remove('in-game');
    },
  };
}

/** Set while "Again" rebuilds a game screen, so its ready panel is passed straight through. */
let replaying = false;

/** Rebuild a game screen for another run that starts at once, with no ready panel first. */
export function replay(again: () => void): void {
  replaying = true;
  try {
    again();
  } finally {
    replaying = false;
  }
}

/** The panel shown before a run: what the game is, and a button that starts it. */
export function readyPanel(frame: Frame, title: string, lines: readonly string[], start: () => void, extra?: Child): void {
  if (replaying) {
    // The player has read it already: "Again" goes straight into the next run.
    replaying = false;
    unlock();
    start();
    return;
  }
  frame.panel(
    el('h1.panel-title', {}, title),
    el('ul.panel-lines', {}, lines.map((line) => el('li', {}, line))),
    extra ?? null,
    el(
      'button.btn.btn-primary.btn-big',
      {
        type: 'button',
        onclick: () => {
          unlock();
          frame.clearPanel();
          start();
        },
      },
      'Start',
    ),
  );
}

/** What the top row shows during the beat before a prompt. */
export function waiting(count: string): Child[] {
  return [el('span.caps', {}, count), el('b.call.wait', {}, '· · ·')];
}
