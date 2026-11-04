// The choice on a note game's ready panel of how much neck to play over: all
// of it, the naturals, or one string. The choice is kept by game, so the menu's
// button comes back to it.

import { scopeString, type Scope } from '../../core/notes';
import { stringName, type Tuning } from '../../core/music';
import { el } from '../dom';
import { keep, pick } from '../store';
import { segmented } from '../ui';
import { panelOption } from './frame';

type Where = 'all' | 'naturals' | 'string';

/**
 * Two rows: where to play, and, when it is one string, which. `go` is given
 * the scope to rebuild the screen for; the choice is kept first.
 */
export function scopePicker(tuning: Tuning, game: 'hunter' | 'sweeper', current: Scope, go: (scope: Scope) => void): HTMLElement {
  const string = scopeString(current);
  const choose = (scope: Scope) => {
    keep(`scope-${game}`, scope);
    go(scope);
  };
  // The string last chosen, so that "One string" comes back to it.
  const lastString = scopeString((pick(`scope-${game}-string`) ?? 'string-0') as Scope) ?? 0;
  if (string !== null) keep(`scope-${game}-string`, current);
  return el(
    'div',
    {},
    panelOption(
      'Where',
      segmented<Where>(
        [
          { value: 'all', label: 'Whole neck' },
          { value: 'naturals', label: 'Naturals' },
          { value: 'string', label: 'One string' },
        ],
        string !== null ? 'string' : (current as Where),
        (where) => choose(where === 'string' ? `string-${lastString}` : where),
      ),
    ),
    string === null
      ? null
      : panelOption(
          'String',
          segmented<number>(
            tuning.open.map((_, i) => ({ value: i, label: stringName(tuning, i) })),
            string,
            (i) => choose(`string-${i}`),
          ),
        ),
  );
}
