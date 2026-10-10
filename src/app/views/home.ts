// The menu: three cabinets, one for each thing the arcade teaches.

import { unlock } from '../../audio/audio';
import { formatValue, MODES, tableKey, type Mode } from '../../core/modes';
import { el } from '../dom';
import type { View } from '../router';
import { getSave } from '../store';

interface Cabinet {
  title: string;
  games: { name: string; blurb: string; modes: Mode[] }[];
}

function modesTitled(title: string): Mode[] {
  return MODES.filter((m) => m.title === title);
}

const CABINETS: Cabinet[] = [
  {
    title: 'Notes',
    games: [
      { name: 'Speed Hunter', blurb: 'A note is called. Find it, against the clock.', modes: modesTitled('Speed Hunter') },
      { name: 'Fret Sweeper', blurb: 'Clear the whole neck: one note at a time, or a new note every tap.', modes: modesTitled('Fret Sweeper') },
    ],
  },
  {
    title: 'Triads',
    games: [
      { name: 'Progressions', blurb: 'Tap three frets, rake the chord, stay close to the last one.', modes: MODES.filter((m) => m.id === 'triads') },
      { name: 'Grid Clear', blurb: 'Find every inversion of one chord on the neck.', modes: MODES.filter((m) => m.id === 'gridclear') },
    ],
  },
  {
    title: 'Bends',
    games: [
      { name: 'Bend by Ear', blurb: 'Push the string to the pitch you heard. No meter.', modes: modesTitled('Bend by Ear') },
      { name: 'Bend Trace', blurb: 'Hear a bend that moves over time, and play it back from memory.', modes: modesTitled('Bend Trace') },
    ],
  },
];

function playButton(mode: Mode, single: boolean): HTMLElement {
  const save = getSave();
  const best = save.scores[tableKey(mode, save.frets)]?.[0];
  return el(
    'a.play',
    { href: `#${mode.route}`, onclick: () => unlock() },
    el('b', {}, single ? 'Play' : mode.variant),
    best ? el('i.num', {}, formatValue(mode, best.value)) : null,
  );
}

export const homeView: View = (root) => {
  root.replaceChildren(
    el(
      'div.home',
      {},
      el(
        'div.cabinets',
        {},
        CABINETS.map((cabinet) =>
          el(
            'section.cabinet',
            {},
            el('h2', {}, cabinet.title),
            cabinet.games.map((game) =>
              el(
                'div.game-card',
                {},
                el('h3', {}, game.name),
                el('p', {}, game.blurb),
                el('div.plays', {}, game.modes.map((m) => playButton(m, game.modes.length === 1))),
              ),
            ),
          ),
        ),
      ),
    ),
  );
};
