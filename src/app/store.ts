// Scores and settings, in localStorage. All shaping and repair of the data is
// core/storage.ts; this file only moves the blob.

import { emptySave, migrate, type SaveData } from '../core/storage';

const KEY = 'fretron.save';

let cache: SaveData | null = null;

export function getSave(): SaveData {
  if (cache) return cache;
  try {
    const text = localStorage.getItem(KEY);
    cache = text ? migrate(JSON.parse(text)) : emptySave();
  } catch {
    // Storage blocked (a private window) or the blob is not JSON: play on
    // without it rather than fail to load.
    cache = emptySave();
  }
  return cache;
}

export function setSave(save: SaveData): void {
  cache = save;
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Nothing useful to do; the session keeps working from the cache.
  }
}

export function updateSave(change: (save: SaveData) => SaveData): SaveData {
  const next = change(getSave());
  setSave(next);
  return next;
}

export function exportSave(): string {
  return JSON.stringify(getSave(), null, 2);
}

/** Replace everything with an exported file's contents. Returns false if it is not one. */
export function importSave(text: string): boolean {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || !('v' in raw)) return false;
    setSave(migrate(raw));
    return true;
  } catch {
    return false;
  }
}
