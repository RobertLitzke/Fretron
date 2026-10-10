import { MODES, tableKey } from '../../core/modes';
import { DEFAULT_FRETS } from '../../core/music';
import { el } from '../dom';
import { scoreTable, tableTitle } from '../game/results';
import type { View } from '../router';
import { getSave } from '../store';
import { page } from '../ui';

export const scoresView: View = (root) => {
  const { scores, frets } = getSave();
  root.replaceChildren(
    page(
      el('h1', {}, 'High scores'),
      frets === DEFAULT_FRETS ? null : el('p.note', {}, `For the ${frets}-fret neck chosen in Settings. Each neck length keeps its own tables.`),
      el(
        'div.tables',
        {},
        MODES.map((mode) =>
          el('section.table-card', {}, el('h2.caps', {}, tableTitle(mode, frets)), scoreTable(mode, scores[tableKey(mode, frets)] ?? [])),
        ),
      ),
    ),
  );
};
