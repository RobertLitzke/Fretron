// Stars, which are all a player is shown of how a run went, and what each takes:
// all three on the ready panel before a run, and on the result card the next
// one up.

import type { Stars, Targets } from '../../core/modes';
import { el } from '../dom';

/** ★★☆, the empty ones dimmed. */
export function stars(n: Stars = 0, cls = ''): HTMLElement {
  return el(`span.stars${cls}`, { 'aria-label': `${n} of 3 stars` }, '★'.repeat(n), el('em', {}, '★'.repeat(3 - n)));
}

/** "Finish within  ★★★ 0:20.0  ★★ 0:36.0  ★ 1:04.0", wrapping where it must. */
export function targetList(targets: Targets): HTMLElement {
  return el(
    'div.targets',
    {},
    el('span.target-lead', {}, targets.lead),
    targets.bars.map(({ stars: n, value }) => el('span.target', {}, stars(n), el('span.num', {}, value))),
  );
}

/** "Next ★★: finish within 0:36.0", or nothing after three stars. */
export function nextTarget(targets: Targets, earned: Stars): HTMLElement | null {
  const next = targets.bars.find((t) => t.stars === earned + 1);
  if (!next) return null;
  const lead = targets.lead.charAt(0).toLowerCase() + targets.lead.slice(1);
  return el('div.target-next', {}, 'Next ', stars(next.stars), `: ${lead} ${next.value}`);
}
