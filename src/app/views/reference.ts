// Reference: nothing to score, only the neck to look at. Notes names every
// fret, or only some; Triads shows every close voicing of one chord, string
// set by string set, with its root, third and fifth coloured. A tap plays what
// it lands on.

import { pluck, strum } from '../../audio/audio';
import { Board, type BoardTouch } from '../../board/board';
import type { LineData, NoteRenderData } from '../../board/renderer';
import { cellMidi, isNatural, pc, pcName, sameCell, STANDARD_TUNING, type Cell, type Spelling } from '../../core/music';
import { chordName, enumerateVoicings, toneLabel, type Chord, type Quality, type Voicing } from '../../core/triads';
import { el } from '../dom';
import type { View } from '../router';
import { getSave, updateSave } from '../store';
import { page, segmented } from '../ui';

type Tab = 'notes' | 'triads';

const QUALITIES: readonly { value: Quality; label: string }[] = [
  { value: 'maj', label: 'Major' },
  { value: 'min', label: 'Minor' },
  { value: 'dim', label: 'Dim' },
  { value: 'aug', label: 'Aug' },
];

/** A string set by its lowest string, or every set at once. */
type StringSet = 'all' | '0' | '1' | '2' | '3';

const STRING_SETS: readonly { value: StringSet; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '0', label: 'E A D' },
  { value: '1', label: 'A D G' },
  { value: '2', label: 'D G B' },
  { value: '3', label: 'G B E' },
];

/** A chord tone as it is written on a note: 'b3' is "♭3", 'd5' is "♭5", '#5' is "♯5". */
function toneText(label: string): string {
  return label.replace('b', '♭').replace('d5', '♭5').replace('#', '♯');
}

function pick(name: string, fallback: string): string {
  return getSave().picks[`ref-${name}`] ?? fallback;
}

function keep(name: string, value: string): void {
  updateSave((s) => ({ ...s, picks: { ...s.picks, [`ref-${name}`]: value } }));
}

export const referenceView: View = (root, ctx) => {
  const tab: Tab = ctx.params.tab === 'triads' ? 'triads' : 'notes';
  const save = getSave();
  const tuning = STANDARD_TUNING;
  const frets = save.frets;
  const board = new Board({ hand: save.hand, tuning, frets, onDown });
  let spelling = pick('spelling', save.accidentals === 'flat' ? 'flat' : 'sharp') as Spelling;

  // --- notes ---------------------------------------------------------------

  /** 'all', 'naturals', or a pitch class. */
  let only = pick('notes', 'all');

  function paintNotes(): void {
    const notes: NoteRenderData[] = [];
    for (let string = 0; string < tuning.open.length; string++) {
      for (let fret = 0; fret <= frets; fret++) {
        const p = pc(cellMidi(tuning, { string, fret }));
        const shown = only === 'all' || (only === 'naturals' ? isNatural(p) : p === Number(only));
        if (!shown) continue;
        // One note picked is drawn as a root. Otherwise the naturals are filled and the sharps and flats hollow, as on a keyboard.
        const one = only !== 'all' && only !== 'naturals';
        const hollow = !one && !isNatural(p);
        notes.push({
          fret,
          stringIndex: string,
          displayLabel: pcName(p, spelling),
          intervalLabel: one ? 'R' : undefined,
          fillColor: one ? undefined : hollow ? board.theme.panel : board.theme.cyan,
          strokeColor: hollow ? board.theme.cyan : undefined,
          labelColor: hollow ? board.theme.cyan : undefined,
          strokeWidth: 1.5,
        });
      }
    }
    board.setLines([]);
    board.setNotes(notes);
  }

  // --- triads --------------------------------------------------------------

  let chord: Chord = { root: Number(pick('root', '0')), quality: pick('quality', 'maj') as Quality };
  let set = pick('strings', '3') as StringSet;
  let voicings: Voicing[] = [];
  /** The voicing last tapped, drawn over the rest. */
  let chosen: Voicing | null = null;
  const title = el('b.ref-chord');

  function outline(v: Voicing, color: string, opacity: number, strokeWidth: number): LineData[] {
    return [
      { from: v[0], to: v[1], color, opacity, strokeWidth },
      { from: v[1], to: v[2], color, opacity, strokeWidth },
    ];
  }

  function paintTriads(): void {
    title.textContent = chordName(chord, spelling);
    voicings = enumerateVoicings(tuning, chord, 0, frets).filter((v) => set === 'all' || v[0].string === Number(set));
    if (chosen && !voicings.some((v) => v.every((c, i) => sameCell(c, chosen![i])))) chosen = null;
    const cells = new Map<string, Cell>();
    for (const v of voicings) for (const c of v) cells.set(`${c.string}:${c.fret}`, c);
    const inChosen = (c: Cell) => !!chosen && chosen.some((x) => sameCell(x, c));
    board.setNotes(
      [...cells.values()].map((c) => {
        const label = toneLabel(chord, cellMidi(tuning, c))!;
        return {
          fret: c.fret,
          stringIndex: c.string,
          intervalLabel: label,
          displayLabel: toneText(label),
          opacity: chosen && !inChosen(c) ? 0.35 : 1,
          radiusScale: inChosen(c) ? 1.12 : 1,
        };
      }),
    );
    // Every set at once is too many lines to read: only the one tapped is drawn.
    const lines = set === 'all' ? [] : voicings.flatMap((v) => outline(v, board.theme.cyan, chosen ? 0.18 : 0.45, 2));
    if (chosen) lines.push(...outline(chosen, board.theme.orange, 1, 3));
    board.setLines(lines);
  }

  // --- the board -----------------------------------------------------------

  function onDown(touch: BoardTouch): void {
    const cell = touch.cell;
    if (!cell) return;
    if (tab === 'notes') {
      pluck(cellMidi(tuning, cell));
      board.flash(cell, board.theme.cyan);
      return;
    }
    const holding = voicings.filter((v) => v.some((c) => sameCell(c, cell)));
    if (!holding.length) {
      chosen = null;
      paintTriads();
      return;
    }
    // A note in more than one voicing: a second tap on it moves on to the next one.
    const at = chosen ? holding.findIndex((v) => v.every((c, i) => sameCell(c, chosen![i]))) : -1;
    chosen = holding[(at + 1) % holding.length];
    strum(chosen.map((c) => cellMidi(tuning, c)));
    paintTriads();
  }

  const paint = () => (tab === 'notes' ? paintNotes() : paintTriads());

  // --- the page ------------------------------------------------------------

  const roots = Array.from({ length: 12 }, (_, i) => i);
  const spellingPick = segmented<Spelling>(
    [
      { value: 'sharp', label: '♯' },
      { value: 'flat', label: '♭' },
    ],
    spelling,
    (s) => {
      spelling = s;
      keep('spelling', s);
      paint();
      if (tab === 'notes') notesRow.replaceChildren(notesPick());
      else rootRow.replaceChildren(rootPick());
    },
  );

  const notesPick = () =>
    segmented<string>(
      [
        { value: 'all', label: 'All' },
        { value: 'naturals', label: 'Naturals' },
        ...roots.map((p) => ({ value: String(p), label: pcName(p, spelling) })),
      ],
      only,
      (v) => {
        only = v;
        keep('notes', v);
        paintNotes();
      },
    );

  const rootPick = () =>
    segmented<number>(
      roots.map((p) => ({ value: p, label: pcName(p, spelling) })),
      chord.root,
      (root) => {
        chord = { ...chord, root };
        chosen = null;
        keep('root', String(root));
        paintTriads();
      },
    );

  const notesRow = el('div.row');
  const rootRow = el('div.row');

  const controls =
    tab === 'notes'
      ? [notesRow]
      : [
          rootRow,
          el(
            'div.row',
            {},
            segmented<Quality>(QUALITIES, chord.quality, (quality) => {
              chord = { ...chord, quality };
              chosen = null;
              keep('quality', quality);
              paintTriads();
            }),
            segmented<StringSet>(STRING_SETS, set, (s) => {
              set = s;
              keep('strings', s);
              paintTriads();
            }),
          ),
        ];
  if (tab === 'notes') notesRow.append(notesPick());
  else rootRow.append(rootPick());

  const view = page(
      el(
        'div.ref-head',
        {},
        el('h1', {}, 'Reference'),
        segmented<Tab>(
          [
            { value: 'notes', label: 'Notes' },
            { value: 'triads', label: 'Triads' },
          ],
          tab,
          (t) => ctx.replace(`/reference/${t}`),
        ),
        spellingPick,
      ),
      el('div.ref-controls', {}, controls),
      tab === 'triads' ? el('p.note.ref-hint', {}, title, ' · tap a note to play the voicing it is part of; tap again for the next one.') : el('p.note.ref-hint', {}, 'Tap a fret to hear it.'),
      el('div.ref-board', {}, board.root),
  );
  view.classList.add('reference');
  root.replaceChildren(view);
  keep('tab', tab);
  paint();

  return () => board.destroy();
};
