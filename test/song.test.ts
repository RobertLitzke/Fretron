import { describe, expect, it } from 'vitest';
import { buildContour, contourDuration, MOVE_BEATS, phraseBeats } from '../src/core/bend';
import { cellMidi, NECK_SIZES, STANDARD_TUNING as T } from '../src/core/music';
import { Rng } from '../src/core/rng';
import { modeById } from '../src/core/modes';
import { makeSongPrompt, placePhrase, SONG_GAMES, SONGS } from '../src/core/songs';
import { NUMB } from '../src/core/songs/numb';

describe('songs', () => {
  it('gives each song a mode for each game it has, off the tour', () => {
    for (const song of SONGS) {
      for (const game of SONG_GAMES) {
        const mode = modeById(`song-${song.id}-${game.kind}`);
        expect(mode !== undefined).toBe(game.has(song));
        if (mode) expect(mode).toMatchObject({ title: song.title, variant: game.name, offTour: true });
      }
    }
  });

  it('writes every bend to the beat: moves of 1 to 4 beats, from a half-beat lead', () => {
    for (const song of SONGS) {
      for (const { phrase } of song.trace?.phrases ?? []) {
        expect([0, 0.5, 1]).toContain(phrase.lead);
        for (const m of phrase.moves) expect(MOVE_BEATS as readonly number[]).toContain(m.beats);
        const c = buildContour(phrase, song.trace!.bpm);
        expect(contourDuration(c)).toBeCloseTo((phraseBeats(phrase) * 60) / song.trace!.bpm, 2);
        expect(contourDuration(c)).toBeLessThan(8);
      }
    }
  });

  it('runs from the gentlest phrase to the hardest', () => {
    const hardness = NUMB.trace!.phrases.map(({ phrase }) => phrase.moves.length + Math.max(...phrase.moves.map((m) => m.to)) / 2);
    expect(hardness[0]).toBeLessThan(hardness[hardness.length - 1]);
    expect(NUMB.trace!.phrases).toHaveLength(10);
  });

  it('keeps each phrase on the neck at its own pitch, moving it to another string or an octave down when it does not fit', () => {
    const rng = new Rng(3);
    for (const frets of NECK_SIZES) {
      NUMB.trace!.phrases.forEach(({ cell }, i) => {
        const p = makeSongPrompt(rng, T, NUMB.trace!, i, frets);
        expect(p.cell.fret).toBeLessThanOrEqual(frets);
        expect(p.cell.fret).toBeGreaterThanOrEqual(5);
        expect((cellMidi(T, cell) - p.from) % 12).toBe(0);
        if (cell.fret <= frets) expect(p.cell).toEqual(cell);
      });
    }
    // The high E's 14th fret, F#, on a 12-fret neck: an octave down on the B string.
    expect(placePhrase(T, { string: 5, fret: 14 }, 12)).toEqual({ string: 4, fret: 7 });
    // The G's 14th, A, is the B string's 10th.
    expect(placePhrase(T, { string: 3, fret: 14 }, 12)).toEqual({ string: 4, fret: 10 });
  });
});
