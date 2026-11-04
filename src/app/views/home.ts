// The menu: three cabinets, one for each thing the arcade teaches.

import { unlock } from '../../audio/audio';
import { formatValue, MODES, modesOf, tableKey, type Mode } from '../../core/modes';
import { SONGS } from '../../core/songs';
import { el } from '../dom';
import type { View } from '../router';
import { getSave, pick, type PickKey } from '../store';

interface Cabinet {
  title: string;
  /**
   * `pick`: the game asks for a choice before a run, kept under this name, and has one Play button for the last one chosen.
   * `named`: its buttons always say which game they are, even when there is one.
   */
  games: { name: string; blurb: string; modes: Mode[]; pick?: PickKey; named?: boolean }[];
}

const CABINETS: Cabinet[] = [
  {
    title: 'Notes',
    games: [
      { name: 'Speed Hunter', blurb: 'A note is called. Find it, against the clock.', modes: modesOf('hunter') },
      { name: 'Name That Fret', blurb: 'A fret lights up. Name the note, against the clock.', modes: modesOf('namer') },
      { name: 'Fret Sweeper', blurb: 'Clear the whole neck: one note at a time, or a new note every tap.', modes: modesOf('sweeper') },
    ],
  },
  {
    title: 'Triads',
    games: [
      { name: 'Progressions', blurb: 'Tap three frets, rake the chord, stay close to the last one.', modes: modesOf('triads'), pick: 'triads' },
      { name: 'Grid Clear', blurb: 'Find every inversion of one chord on the neck.', modes: modesOf('gridclear') },
    ],
  },
  {
    title: 'Bends',
    games: [
      { name: 'Bend by Ear', blurb: 'Push the string to the pitch you heard. No meter.', modes: modesOf('bend') },
      { name: 'Bend Trace', blurb: 'Hear a bend that moves over time, and play it back from memory.', modes: modesOf('trace') },
      { name: 'Scale Bends', blurb: 'Bend from one note of a scale to the next, with the shape drawn around you.', modes: modesOf('scalebend'), pick: 'scalebend' },
      { name: 'Scale Builder', blurb: 'Pick a scale, hear the root, and bend it into place by ear, up and back down.', modes: modesOf('scales'), pick: 'scales' },
    ],
  },
  {
    // A card for each song, with a button for each game it has its own version of.
    title: 'Songs',
    games: SONGS.map((song) => ({ name: song.title, blurb: `Games inspired by the song: ${song.about}.`, modes: MODES.filter((m) => m.song === song.id), named: true })),
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

/** The mode last chosen for a game that asks before a run, or its first. */
function picked(modes: Mode[], key: PickKey): Mode {
  const choice = pick(key);
  return modes.find((m) => m.id === `${key}-${choice}`) ?? modes[0];
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
            cabinet.games.map((game) => {
              const modes = game.pick ? [picked(game.modes, game.pick)] : game.modes;
              return el(
                'div.game-card',
                {},
                el('h3', {}, game.name),
                el('p', {}, game.blurb),
                el('div.plays', {}, modes.map((m) => playButton(m, modes.length === 1 && !game.named))),
              );
            }),
          ),
        ),
      ),
    ),
  );
};
