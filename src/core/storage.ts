// What is kept between visits, as plain data. Where it is kept (localStorage
// today) is the app's business: it hands this module a parsed blob and gets a
// SaveData back. A sync backend later only has to move the same blob.

import type { Hand } from './geometry';
import type { Rank } from './modes';
import { DEFAULT_FRETS, NECK_SIZES } from './music';
import type { Accidentals } from './notes';

export const SAVE_VERSION = 1;

/** Places on each score table. */
export const TABLE_SIZE = 10;

export interface ScoreEntry {
  /** Three letters. */
  name: string;
  value: number;
  rank: Rank;
  /** ISO date. */
  date: string;
}

export interface SaveData {
  v: typeof SAVE_VERSION;
  /** A left- or right-handed guitar. */
  hand: Hand;
  /** 0 to 1. */
  volume: number;
  /** How notes sound: the original synth tone or an overdriven electric guitar. */
  voice: 'synth' | 'guitar';
  accidentals: Accidentals;
  /** How many frets the games are played over: one of NECK_SIZES. */
  frets: number;
  /** The initials last entered, offered again next time. */
  initials: string;
  /** Score tables by modes.ts's tableKey, best first. */
  scores: Record<string, ScoreEntry[]>;
  /** What was last chosen before a game that asks for a choice, by game: the scale for Scale Bends. */
  picks: Record<string, string>;
}

export function emptySave(): SaveData {
  return { v: SAVE_VERSION, hand: 'right', volume: 0.8, voice: 'synth', accidentals: 'mixed', frets: DEFAULT_FRETS, initials: 'AAA', scores: {}, picks: {} };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Three characters from A to Z, digits and the underscore; anything else becomes an underscore. */
export function cleanInitials(text: unknown): string {
  const raw = typeof text === 'string' ? text.toUpperCase() : '';
  let out = '';
  for (const ch of raw) out += /[A-Z0-9_]/.test(ch) ? ch : '_';
  return (out + 'AAA').slice(0, 3);
}

function cleanEntry(x: unknown): ScoreEntry | null {
  if (!isObject(x) || typeof x.value !== 'number' || !Number.isFinite(x.value)) return null;
  const rank = x.rank === 'S' || x.rank === 'A' || x.rank === 'B' || x.rank === 'C' ? x.rank : 'C';
  return { name: cleanInitials(x.name), value: x.value, rank, date: typeof x.date === 'string' ? x.date : '' };
}

/** Turn whatever was stored into a SaveData, dropping what cannot be read. */
export function migrate(raw: unknown): SaveData {
  const save = emptySave();
  if (!isObject(raw)) return save;
  if (raw.hand === 'left' || raw.hand === 'right') save.hand = raw.hand;
  if (typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1) save.volume = raw.volume;
  if (raw.voice === 'synth' || raw.voice === 'guitar') save.voice = raw.voice;
  if (raw.accidentals === 'mixed' || raw.accidentals === 'sharp' || raw.accidentals === 'flat') save.accidentals = raw.accidentals;
  if ((NECK_SIZES as readonly unknown[]).includes(raw.frets)) save.frets = raw.frets as number;
  save.initials = cleanInitials(raw.initials);
  if (isObject(raw.scores)) {
    for (const [mode, list] of Object.entries(raw.scores)) {
      if (!Array.isArray(list)) continue;
      const entries = list.map(cleanEntry).filter((e): e is ScoreEntry => e !== null);
      if (entries.length) save.scores[mode] = entries.slice(0, TABLE_SIZE);
    }
  }
  if (isObject(raw.picks)) {
    for (const [game, pick] of Object.entries(raw.picks)) if (typeof pick === 'string') save.picks[game] = pick;
  }
  return save;
}

function beats(a: number, b: number, better: 'high' | 'low'): boolean {
  return better === 'high' ? a > b : a < b;
}

/** The place (0 is first) a value would take on a table, or -1 if it does not make it. */
export function placeFor(entries: readonly ScoreEntry[], value: number, better: 'high' | 'low'): number {
  // A tie goes below the run that got there first.
  let place = entries.findIndex((e) => beats(value, e.value, better));
  if (place === -1) place = entries.length;
  return place < TABLE_SIZE ? place : -1;
}

export function withScore(save: SaveData, mode: string, entry: ScoreEntry, better: 'high' | 'low'): SaveData {
  const entries = save.scores[mode] ?? [];
  const place = placeFor(entries, entry.value, better);
  if (place === -1) return save;
  const next = entries.slice();
  next.splice(place, 0, entry);
  return { ...save, initials: entry.name, scores: { ...save.scores, [mode]: next.slice(0, TABLE_SIZE) } };
}
