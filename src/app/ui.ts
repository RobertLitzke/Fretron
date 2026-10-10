// Small pieces every view uses.

import { el, type Child } from './dom';

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
