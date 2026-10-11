// Which tour is up: the one last picked on the map, if it is open.

import type { SaveData } from '../../core/storage';
import { FIRST_TOUR, LAST_TOUR, tourFor, tourOpen, type Tour } from '../../core/tour';

/** Every tour open so far, first first. */
export function openTours(save: SaveData): number[] {
  const out: number[] = [];
  for (let id = FIRST_TOUR; id <= LAST_TOUR && tourOpen(id, save.tours); id++) out.push(id);
  return out;
}

export function currentTour(save: SaveData): Tour {
  const picked = Number(save.picks.tour);
  return tourFor(openTours(save).includes(picked) ? picked : FIRST_TOUR);
}

/** The tour's look on the page: main.ts puts these on <html> while on tour. */
export function lookAttributes(tour: Tour): Record<string, string> {
  return { genre: tour.look.genre, era: tour.look.era, continent: tour.look.continent };
}

const LOOK_KEYS = ['skin', 'genre', 'era', 'continent'] as const;

/** Dress the page for a tour: its genre, era and continent on <html>. */
export function applyLook(tour: Tour): void {
  const data = document.documentElement.dataset;
  data.skin = 'tour';
  Object.assign(data, lookAttributes(tour));
}

export function clearLook(): void {
  const data = document.documentElement.dataset;
  for (const key of LOOK_KEYS) delete data[key];
}
