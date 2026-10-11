// World Tour: the map of legs, each a travel sticker, and the set list of the
// leg picked, with its sleeve. A stop plays the ordinary game under /tour.

import { unlock } from '../../audio/audio';
import { formatValue } from '../../core/modes';
import {
  currentLeg,
  legBooked,
  legGold,
  legSoldOut,
  legStars,
  MAX_STARS,
  nextBooking,
  starsFor,
  stopMode,
  totalStars,
  tourFor,
  type Leg,
} from '../../core/tour';
import { el } from '../dom';
import type { View } from '../router';
import { getSave, updateSave } from '../store';
import { applyLook, currentTour, openTours } from '../tour/current';
import { sleeveSvg } from '../tour/sleeves';
import { GENRES } from '../../core/looks';

const GENRE_WORDS: Record<string, string> = Object.fromEntries(GENRES.map((g) => [g.id, g.words]));

const SHAPES = ['round', 'pennant', 'oval', 'shield', 'round', 'pennant'] as const;
/** Where each sticker sits on the map, in percent: a zigzag along the road. */
const PLACES: readonly (readonly [number, number, number])[] = [
  [13, 70, -8],
  [29, 30, 5],
  [45, 70, -4],
  [61, 30, 6],
  [76, 70, -6],
  [87, 30, 7],
];

export function starRow(stars: number): HTMLElement {
  return el('span.tour-stars', { 'aria-label': `${stars} of 3 stars` }, '★'.repeat(stars), el('em', {}, '★'.repeat(3 - stars)));
}

function sleeve(leg: Leg, booked: boolean): HTMLElement {
  const node = el(`div.tour-sleeve${booked ? '' : '.wrapped'}`);
  node.innerHTML = sleeveSvg(leg.sleeve);
  return node;
}

export const tourView: View = (root) => {
  const render = () => {
    const save = getSave();
    const tour = currentTour(save);
    const { id, year, legs } = tour;
    const ids = openTours(save);
    const record = save.tours[id] ?? {};
    const stars = totalStars(legs, record);
    const next = nextBooking(legs, stars);
    const now = currentLeg(legs, stars);
    const legKey = `tour${id}`;
    const picked = Number(save.picks[legKey]);
    const legIndex = Number.isInteger(picked) && picked >= 0 && picked < legs.length ? picked : now;
    const leg = legs[legIndex];
    const booked = legBooked(leg, stars);

    const pick = (i: number) => {
      updateSave((s) => ({ ...s, picks: { ...s.picks, [legKey]: String(i) } }));
      render();
    };
    const toTour = (to: number) => {
      updateSave((s) => ({ ...s, picks: { ...s.picks, tour: String(to) } }));
      // The look changes with the tour.
      applyLook(tour.id === to ? tour : tourFor(to));
      render();
    };
    const at = ids.indexOf(id);
    const earlier = ids[at - 1];
    const later = ids[at + 1];

    const stickers = legs.map((l, i) => {
      const isBooked = legBooked(l, stars);
      const [x, y, turn] = PLACES[i];
      const legStarsNow = legStars(l, record);
      const classes = [`sticker`, SHAPES[i], isBooked ? (i === now ? 'here' : 'filled') : 'locked', i === legIndex ? 'picked' : '']
        .filter(Boolean)
        .join('.');
      return el(
        `button.${classes}`,
        { type: 'button', style: `left:${x}%;top:${y}%;--c:var(--c${i + 1});--r:${turn}deg`, onclick: () => pick(i) },
        el(
          'span.face',
          {},
          el(
            'span',
            {},
            el('span.leg', {}, `Leg ${i + 1}`),
            el('span.name', {}, l.name),
            el('span.sub', {}, isBooked ? l.venue : `★ ${l.booking} to book`),
            isBooked ? el('span.got', {}, `★ ${legStarsNow} / ${3 * l.stops.length}`) : null,
          ),
        ),
        legGold(l, record) ? el('span.stamp.gold', {}, 'GOLD') : legSoldOut(l, record) ? el('span.stamp', {}, 'SOLD OUT') : null,
      );
    });

    // The first stop short of three stars is the one offered.
    const stopIndex = Math.max(
      0,
      leg.stops.findIndex((s) => starsFor(record[s.mode]?.rank) < 3),
    );
    let chosen = stopIndex;
    const playButton = el('a.tour-play') as HTMLAnchorElement;
    const rows = leg.stops.map((stop, i) => {
      const mode = stopMode(stop);
      const best = record[stop.mode];
      const rank = best?.rank;
      return el(
        'button.song',
        { type: 'button', disabled: !booked, onclick: () => choose(i) },
        el('span.n', {}, String(i + 1)),
        el(
          'span.t',
          {},
          stop.city,
          el('i', {}, `${mode.title} · ${mode.variant} · `, rank ? (best?.value !== undefined ? `best ${formatValue(mode, best.value)}` : 'played') : 'not played yet'),
        ),
        starRow(starsFor(rank)),
      );
    });
    const choose = (i: number) => {
      chosen = i;
      rows.forEach((r, k) => r.classList.toggle('sel', k === i));
      const stop = leg.stops[i];
      const mode = stopMode(stop);
      playButton.textContent = `Play ${stop.city}`;
      playButton.href = `#/tour${mode.route}`;
      playButton.onclick = () => unlock();
    };
    if (booked) choose(chosen);

    const view = el(
      'div.tour',
      {},
      el(
        'header.tour-top',
        {},
        el('a.tour-back', { href: '#/home', 'aria-label': 'Back to the games' }, '←'),
        el('span.tour-title', {}, `Fretron ${tour.title}`),
        el(
          'span.tour-years',
          {},
          el('button.tour-year-step', { type: 'button', disabled: earlier === undefined, 'aria-label': 'Earlier tour', onclick: () => toTour(earlier) }, '‹'),
          el('b', {}, `'${year}`, el('i', {}, GENRE_WORDS[tour.look.genre])),
          el('button.tour-year-step', { type: 'button', disabled: later === undefined, 'aria-label': 'Later tour', onclick: () => toTour(later) }, '›'),
        ),
        el('span.tour-total', {}, el('b', {}, '★'), ` ${stars}`, el('i', {}, ` / ${MAX_STARS}${next ? ` · next leg at ${next.booking}` : later ? ' · your next tour is booked' : ' · the whole tour'}`)),
      ),
      el(
        'div.tour-body',
        {},
        el('div.tour-map', {}, road(), stickers, el('span.tour-postmark', {}, el('b', {}, `'${year}`))),
        el(
          'div.setlist',
          {},
          el(
            'div.setlist-head',
            {},
            sleeve(leg, booked),
            el('div', {}, el('h2', {}, 'Set list'), el('div.where', {}, `Leg ${legIndex + 1} · ${leg.name} · ${leg.venue}`)),
          ),
          rows,
          booked ? playButton : el('p.tour-locked', {}, `Book this leg with ★ ${leg.booking}. You have ${stars}.`),
        ),
      ),
    );
    root.replaceChildren(view);
  };
  render();
};

/** The dashed road between the stickers. */
function road(): HTMLElement {
  const pts = PLACES.map(([x, y]) => [x, y] as const);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  const node = el('div.tour-road');
  node.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  return node;
}
