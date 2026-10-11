// Stars, which are all a player is shown of a run's rank, and what each takes:
// all three on the ready panel before a run, and on the result card the next
// one up.

import type { Rank, Targets } from '../../core/modes';
import { starsFor } from '../../core/tour';
import { el } from '../dom';

/** ★★☆, the empty ones dimmed. */
export function stars(rank: Rank | undefined, cls = ''): HTMLElement {
  const n = starsFor(rank);
  return el(`span.stars${cls}`, { 'aria-label': `${n} of 3 stars` }, '★'.repeat(n), el('em', {}, '★'.repeat(3 - n)));
}

/** "Finish within  ★★★ 0:20.0  ★★ 0:36.0  ★ 1:04.0", wrapping where it must. */
export function targetList(targets: Targets): HTMLElement {
  return el(
    'div.targets',
    {},
    el('span.target-lead', {}, targets.lead),
    targets.ranks.map(({ rank, value }) => el('span.target', {}, stars(rank), el('span.num', {}, value))),
  );
}

/** "Next ★★: finish within 0:36.0", or nothing after three stars. */
export function nextTarget(targets: Targets, earned: Rank): HTMLElement | null {
  const at = targets.ranks.findIndex((t) => t.rank === earned);
  const next = at === -1 ? targets.ranks.at(-1) : targets.ranks[at - 1];
  if (!next) return null;
  const lead = targets.lead.charAt(0).toLowerCase() + targets.lead.slice(1);
  return el('div.target-next', {}, 'Next ', stars(next.rank), `: ${lead} ${next.value}`);
}
