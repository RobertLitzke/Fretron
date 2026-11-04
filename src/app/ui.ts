// Small pieces every view uses.

import { el, type Child } from './dom';
import type { ViewContext } from './router';

export function page(...children: Child[]): HTMLElement {
  return el('div.page', {}, ...children);
}

let toastTimer = 0;

/** A short message at the foot of the screen, with an optional action. */
export function toast(message: string, action?: { label: string; run: () => void }, lingerMs = 2600): void {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = el('div.toast', { role: 'status' }, message);
  if (action) {
    node.append(
      el(
        'button.btn.btn-small',
        {
          onclick: () => {
            node.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  }
  document.body.append(node);
  if (!action) toastTimer = window.setTimeout(() => node.remove(), lingerMs);
}

/** A seed for a run: different every time. */
export function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** The run on screen: its route and seed, and whether it came from a link, for the link that replays it. */
let run: { path: string; seed: number; shared: boolean; daily: string | null } = { path: '', seed: 0, shared: false, daily: null };

/**
 * The seed a game screen draws its run from: the one in the link (so two
 * phones opening the same link play the same run), or a fresh one. The link to
 * this run is kept for the result card.
 */
export function runSeed(ctx: ViewContext): number {
  const given = Number(ctx.query.seed);
  const shared = Number.isInteger(given) && given >= 0 && given <= 0xffffffff;
  run = { path: ctx.path, seed: shared ? given : freshSeed(), shared, daily: ctx.query.daily ?? null };
  return run.seed;
}

/** A link that opens the run on screen again, prompt for prompt. */
export function runLink(): string {
  const daily = run.daily ? `&daily=${encodeURIComponent(run.daily)}` : '';
  return `${location.origin}${location.pathname}#${run.path}?seed=${run.seed}${daily}`;
}

/** Whether the run on screen was opened from a link, and the day it is the daily run of, if it is. */
export function runFrom(): { shared: boolean; daily: string | null } {
  return { shared: run.shared, daily: run.daily };
}

/** Offer a link to the run: the share sheet where there is one, or the clipboard. */
export async function shareRun(text: string): Promise<void> {
  const url = runLink();
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
  try {
    if (nav.share) await nav.share({ title: 'Fretron', text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast('Link copied');
    }
  } catch {
    // The share sheet was closed, or the clipboard refused: nothing to do.
  }
}

/** A row of mutually exclusive buttons. */
export function segmented<T extends string | number>(
  options: readonly { value: T; label: string }[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  let current = initial;
  const buttons = options.map((o) =>
    el(
      'button',
      {
        type: 'button',
        onclick: () => {
          current = o.value;
          paint();
          onPick(o.value);
        },
      },
      o.label,
    ),
  );
  const paint = () => buttons.forEach((b, i) => b.classList.toggle('on', options[i].value === current));
  paint();
  return el('div.seg', { role: 'group' }, buttons);
}

/** Fill the screen, where the browser allows it; leave it if already full. */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function canFullscreen(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function';
}
