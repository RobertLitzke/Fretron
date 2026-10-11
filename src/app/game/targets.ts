// What each star takes, so a player knows what to aim for: all three ranks on
// the ready panel before a run, and on the result card the next rank up.

import type { Rank, Targets } from '../../core/modes';
import { starsFor } from '../../core/tour';
import { el } from '../dom';

function stars(rank: Rank): HTMLElement {
  const n = starsFor(rank);
  return el('span.target-stars', { 'aria-label': `${n} stars` }, '★'.repeat(n), el('em', {}, '★'.repeat(3 - n)));
}

/** "Finish within  S ★★★ 0:20.0  A ★★ 0:36.0  B ★ 1:04.0", wrapping where it must. */
export function targetList(targets: Targets): HTMLElement {
  return el(
    'div.targets',
    {},
    el('span.target-lead', {}, targets.lead),
    targets.ranks.map(({ rank, value }) => el('span.target', {}, el(`b.target-rank.rank-${rank}`, {}, rank), stars(rank), el('span.num', {}, value))),
  );
}

/** "Next ★★: finish within 0:36.0", or nothing after an S. */
export function nextTarget(targets: Targets, earned: Rank): HTMLElement | null {
  const at = targets.ranks.findIndex((t) => t.rank === earned);
  const next = at === -1 ? targets.ranks.at(-1) : targets.ranks[at - 1];
  if (!next) return null;
  const lead = targets.lead.charAt(0).toLowerCase() + targets.lead.slice(1);
  return el('div.target-next', {}, 'Next ', stars(next.rank), `: ${lead} ${next.value}`);
}
