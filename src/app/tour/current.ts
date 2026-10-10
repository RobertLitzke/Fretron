// Which tour is up: the one last picked on the map, if it is open.

import type { SaveData } from '../../core/storage';
import { FIRST_YEAR, LAST_YEAR, tourFor, tourOpen, type Tour } from '../../core/tour';

/** Every tour open so far, oldest first. */
export function openYears(save: SaveData): number[] {
  const out: number[] = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR && tourOpen(year, save.tours); year++) out.push(year);
  return out;
}

export function currentTour(save: SaveData): Tour {
  const picked = Number(save.picks.tourYear);
  return tourFor(openYears(save).includes(picked) ? picked : FIRST_YEAR);
}
