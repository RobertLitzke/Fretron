import { describe, expect, it } from 'vitest';
import { formatSeconds, modeById, MODES, rankBend, rankHunter, rankSweep, tableKey } from '../src/core/modes';
import { cleanInitials, emptySave, migrate, placeFor, TABLE_SIZE, withScore, type SaveData, type ScoreEntry } from '../src/core/storage';

const entry = (value: number, name = 'AAA'): ScoreEntry => ({ name, value, rank: 'B', date: '2026-10-10T00:00:00.000Z' });

describe('the save', () => {
  it('starts right-handed', () => {
    expect(emptySave().hand).toBe('right');
  });

  it('survives a round trip', () => {
    let save: SaveData = { ...emptySave(), hand: 'left', volume: 0.3, voice: 'guitar', accidentals: 'flat', frets: 15 };
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
    expect(save.scores).toEqual({ sweeper: [{ name: 'ABA', value: 90, rank: 'C', date: '' }] });
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
  });

  it('writes a time as minutes, seconds and tenths', () => {
    expect(formatSeconds(0)).toBe('0:00.0');
    expect(formatSeconds(75.26)).toBe('1:15.3');
    expect(formatSeconds(599.96)).toBe('10:00.0');
  });

  it('ranks from S down to C', () => {
    expect(rankHunter(18, 20)).toBe('S');
    expect(rankHunter(200, 20)).toBe('C');
    expect(rankSweep(150, 132)).toBe('S');
    expect(rankSweep(900, 132)).toBe('C');
    expect(rankBend(4)).toBe('S');
    expect(rankBend(12)).toBe('A');
    expect(rankBend(25)).toBe('B');
    expect(rankBend(80)).toBe('C');
  });
});
