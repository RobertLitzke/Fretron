// The end of a run: the rank, the numbers, initials if the run made the table,
// and the table.

import { fanfare } from '../../audio/audio';
import { formatValue, RANK_WORDS, tableKey, type Mode, type Rank } from '../../core/modes';
import { DEFAULT_FRETS } from '../../core/music';
import { placeFor, withScore, type ScoreEntry } from '../../core/storage';
import { el } from '../dom';
import type { ViewContext } from '../router';
import { getSave, updateSave } from '../store';
import type { Frame } from './frame';

export interface RunResult {
  mode: Mode;
  /** Points, or seconds: whatever the mode's table is sorted by. */
  value: number;
  rank: Rank;
  /** Label and value pairs for the card. */
  stats: readonly (readonly [string, string])[];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';

/** "Speed Hunter · By name", with the neck length when it is not the usual one. */
export function tableTitle(mode: Mode, frets: number): string {
  return `${mode.title} · ${mode.variant}${frets === DEFAULT_FRETS ? '' : ` · ${frets} frets`}`;
}

export function scoreTable(mode: Mode, entries: readonly ScoreEntry[], highlight = -1): HTMLElement {
  if (entries.length === 0) return el('p.muted.table-empty', {}, 'No scores yet.');
  return el(
    'ol.table',
    {},
    entries.map((e, i) =>
      el(
        `li${i === highlight ? '.you' : ''}`,
        {},
        el('span.table-place.num', {}, String(i + 1)),
        el('span.table-name', {}, e.name),
        el(`span.table-rank.rank-${e.rank}`, {}, e.rank),
        el('span.table-value.num', {}, formatValue(mode, e.value)),
      ),
    ),
  );
}

/** Three letters, each stepped up and down, the way a cabinet takes them. */
function initialsEntry(initial: string, done: (name: string) => void): HTMLElement {
  const letters = initial.split('').map((ch) => Math.max(0, LETTERS.indexOf(ch)));
  let active = 0;
  const slots = letters.map((_, i) => {
    const glyph = el('b.slot-letter');
    const step = (by: number) => {
      active = i;
      letters[i] = (letters[i] + by + LETTERS.length) % LETTERS.length;
      paint();
    };
    return {
      glyph,
      node: el(
        'div.slot',
        { onclick: () => { active = i; paint(); } },
        el('button.slot-step', { type: 'button', 'aria-label': 'Next letter', onclick: (e: MouseEvent) => { e.stopPropagation(); step(1); } }, '▲'),
        glyph,
        el('button.slot-step', { type: 'button', 'aria-label': 'Previous letter', onclick: (e: MouseEvent) => { e.stopPropagation(); step(-1); } }, '▼'),
      ),
    };
  });
  const paint = () =>
    slots.forEach((slot, i) => {
      slot.glyph.textContent = LETTERS[letters[i]];
      slot.node.classList.toggle('active', i === active);
    });
  paint();
  const name = () => letters.map((i) => LETTERS[i]).join('');
  const node = el(
    'div.initials',
    { tabIndex: 0 },
    el('div.slots', {}, slots.map((s) => s.node)),
    el('button.btn.btn-primary', { type: 'button', onclick: () => done(name()) }, 'Enter'),
  );
  // A keyboard types straight into the slots.
  node.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();
    if (e.key === 'Enter') done(name());
    else if (e.key === 'Backspace') active = Math.max(0, active - 1);
    else if (key.length === 1 && LETTERS.includes(key)) {
      letters[active] = LETTERS.indexOf(key);
      active = Math.min(2, active + 1);
    } else return;
    e.preventDefault();
    paint();
  });
  return node;
}

export function showResult(frame: Frame, ctx: ViewContext, result: RunResult, again: () => void): void {
  const { mode, value, rank } = result;
  fanfare();
  frame.setAction(null);

  const key = tableKey(mode, frame.frets);
  const entries = () => getSave().scores[key] ?? [];
  const place = placeFor(entries(), value, mode.better);
  const side = el('div.result-side');

  const showTable = (highlight: number) => {
    side.replaceChildren(el('h2.caps', {}, tableTitle(mode, frame.frets)), scoreTable(mode, entries(), highlight));
  };

  if (place >= 0) {
    side.replaceChildren(
      el('h2.result-new', {}, place === 0 ? 'New best' : `On the board: no. ${place + 1}`),
      el('p.muted', {}, 'Enter your initials'),
      initialsEntry(getSave().initials, (name) => {
        updateSave((s) => withScore(s, key, { name, value, rank, date: new Date().toISOString() }, mode.better));
        showTable(place);
      }),
    );
  } else showTable(-1);

  const panel = frame.panel(
    el(
      'div.result',
      {},
      el(
        'div.result-card',
        {},
        el(`div.result-rank.rank-${rank}`, {}, rank),
        el('div.result-words', {}, RANK_WORDS[rank]),
        el('div.result-value.num', {}, formatValue(mode, value)),
        el(
          'dl.result-stats',
          {},
          result.stats.map(([label, text]) => [el('dt', {}, label), el('dd.num', {}, text)]),
        ),
      ),
      side,
    ),
    el(
      'div.row.result-buttons',
      {},
      el('button.btn.btn-primary', { type: 'button', onclick: again }, 'Again'),
      el('button.btn', { type: 'button', onclick: () => ctx.navigate('/scores') }, 'Scores'),
      el('button.btn', { type: 'button', onclick: () => ctx.navigate('/home') }, 'Menu'),
    ),
  );
  panel.classList.add('panel-wide');
  (side.querySelector('.initials') as HTMLElement | null)?.focus();
}
