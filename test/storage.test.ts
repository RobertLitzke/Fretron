import { describe, expect, it } from 'vitest';
import {
  bendTargets,
  formatSeconds,
  gridTargets,
  hunterTargets,
  modeById,
  MODES,
  starsBend,
  starsGrid,
  starsHunter,
  starsSweep,
  starsSweepRandom,
  starsTriads,
  sweepTargets,
  tableKey,
  triadTargets,
  type Targets,
} from '../src/core/modes';
import { cleanInitials, emptySave, migrate, placeFor, TABLE_SIZE, withScore, type SaveData, type ScoreEntry } from '../src/core/storage';

const entry = (value: number, name = 'AAA'): ScoreEntry => ({ name, value, stars: 1, date: '2026-10-10T00:00:00.000Z' });

describe('the save', () => {
  it('starts right-handed', () => {
    expect(emptySave().hand).toBe('right');
  });

  it('survives a round trip', () => {
    let save: SaveData = { ...emptySave(), hand: 'left', volume: 0.3, voice: 'guitar', accidentals: 'flat', frets: 15, picks: { scalebend: 'major' } };
    save = withScore(save, 'sweeper', entry(201.4, 'ROB'), 'low');
    expect(migrate(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('repairs what it cannot read', () => {
    const save = migrate({ hand: 'both', volume: 9, voice: 'banjo', accidentals: 3, frets: 13, initials: 'q', scores: { sweeper: [{ value: 'fast' }, { name: 'ab', value: 90, rank: 'Z' }], bad: 'x' } });
    expect(save.hand).toBe('right');
    expect(save.volume).toBe(0.8);
    expect(save.voice).toBe('synth');
    expect(save.accidentals).toBe('mixed');
    expect(save.frets).toBe(12);
    expect(save.initials).toBe('QAA');
    expect(save.scores).toEqual({ sweeper: [{ name: 'ABA', value: 90, stars: 0, date: '' }] });
    // An older save's rank letters come across as stars.
    expect(migrate({ scores: { bend: [{ name: 'ROB', value: 9, rank: 'A', date: 'd' }] } }).scores.bend[0].stars).toBe(2);
    expect(migrate(null)).toEqual(emptySave());
    expect(migrate('nonsense')).toEqual(emptySave());
  });

  it('keeps initials to three letters, digits or underscores', () => {
    expect(cleanInitials('d g')).toBe('D_G');
    expect(cleanInitials('hendrix')).toBe('HEN');
    expect(cleanInitials('')).toBe('AAA');
    expect(cleanInitials(42)).toBe('AAA');
  });
});

describe('score tables', () => {
  it('ranks points high to low and times low to high', () => {
    const points = [entry(900), entry(500), entry(100)];
    expect(placeFor(points, 1000, 'high')).toBe(0);
    expect(placeFor(points, 600, 'high')).toBe(1);
    expect(placeFor(points, 50, 'high')).toBe(3);
    const times = [entry(120), entry(180), entry(240)];
    expect(placeFor(times, 100, 'low')).toBe(0);
    expect(placeFor(times, 200, 'low')).toBe(2);
  });

  it('puts a tie below the run that got there first', () => {
    expect(placeFor([entry(500), entry(300)], 500, 'high')).toBe(1);
  });

  it('holds ten places and turns away an eleventh that does not beat them', () => {
    let save = emptySave();
    for (let i = 0; i < 12; i++) save = withScore(save, 'triads', entry(1000 + i * 10), 'high');
    const table = save.scores.triads;
    expect(table.length).toBe(TABLE_SIZE);
    expect(table[0].value).toBe(1110);
    expect(table[9].value).toBe(1020);
    expect(placeFor(table, 1015, 'high')).toBe(-1);
    expect(withScore(save, 'triads', entry(5), 'high')).toBe(save);
  });

  it('remembers the initials last entered', () => {
    expect(withScore(emptySave(), 'triads', entry(10, 'JMI'), 'high').initials).toBe('JMI');
  });
});

describe('modes', () => {
  it('have distinct ids and routes, and bend games come in three tiers', () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    expect(new Set(MODES.map((m) => m.route)).size).toBe(MODES.length);
    expect(MODES.filter((m) => m.title === 'Bend by Ear').length).toBe(3);
    expect(MODES.filter((m) => m.title === 'Bend Trace').length).toBe(3);
  });

  it('keeps a table for each neck length, with the usual neck under the plain name', () => {
    const sweeper = modeById('sweeper')!;
    expect(tableKey(sweeper, 12)).toBe('sweeper');
    expect(tableKey(sweeper, 22)).toBe('sweeper@22');
    // Bend tables were started afresh when their points were rescaled.
    expect(tableKey(modeById('bend-standard')!, 12)).toBe('bend-standard.3');
    expect(tableKey(modeById('bend-standard')!, 22)).toBe('bend-standard.3@22');
  });

  it('writes a time as minutes, seconds and tenths', () => {
    expect(formatSeconds(0)).toBe('0:00.0');
    expect(formatSeconds(75.26)).toBe('1:15.3');
    expect(formatSeconds(599.96)).toBe('10:00.0');
  });

  it('gives three stars down to none', () => {
    expect(starsHunter(18, 20)).toBe(3);
    expect(starsHunter(200, 20)).toBe(0);
    expect(starsSweep(150, 132)).toBe(3);
    expect(starsSweep(900, 132)).toBe(0);
    expect(starsBend(4)).toBe(3);
    expect(starsBend(12)).toBe(2);
    expect(starsBend(25)).toBe(1);
    expect(starsBend(80)).toBe(0);
  });
});

describe('star targets', () => {
  /** "1:04.0" → 64 */
  const secondsIn = (text: string) => {
    const [, m, sec] = /^(\d+):(\d+\.\d)$/.exec(text)!;
    return Number(m) * 60 + Number(sec);
  };

  it('name a time that earns the stars it is shown for, and a slower one that does not', () => {
    const cases: [Targets, (s: number) => number][] = [
      [hunterTargets(20), (s) => starsHunter(s, 20)],
      [hunterTargets(20, true), (s) => starsHunter(s, 20, true)],
      [sweepTargets(133), (s) => starsSweep(s, 133)],
      [sweepTargets(133, true), (s) => starsSweepRandom(s, 133)],
      [gridTargets(15), (s) => starsGrid(s, 15)],
    ];
    for (const [targets, starsFor] of cases) {
      expect(targets.bars.map((t) => t.stars)).toEqual([3, 2, 1]);
      for (const t of targets.bars) {
        expect(starsFor(secondsIn(t.value))).toBe(t.stars);
        expect(starsFor(secondsIn(t.value) + 0.2)).not.toBe(t.stars);
      }
    }
    expect(hunterTargets(20).bars.map((t) => t.value)).toEqual(['0:20.0', '0:36.0', '1:04.0']);
  });

  it('give triads as a share before a run and as points after it', () => {
    expect(triadTargets().bars[0].value).toBe('65%');
    expect(triadTargets().lead).toBe('Share of the points to score');
    expect(triadTargets(120000).bars.map((t) => t.value)).toEqual(['78,000', '50,400', '26,400']);
    expect(starsTriads(78000, 120000)).toBe(3);
    expect(starsTriads(77999, 120000)).toBe(2);
  });

  it('give bends in cents', () => {
    expect(bendTargets().bars.map((t) => t.value)).toEqual(['8 ¢', '15 ¢', '30 ¢']);
    expect(starsBend(8)).toBe(3);
  });
});
