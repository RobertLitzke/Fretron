# Fretron

An arcade for learning the guitar fretboard, played on a phone held sideways:
find notes, build triads and move between them, and bend strings to pitch by
ear. The game design is in [fretboard_game.md](fretboard_game.md); the section
[Where this differs from the design document](#where-this-differs-from-the-design-document)
lists what was built differently and why.

The project folder is `FretQuiz`. The shell (build, service worker, router,
save file) started as a copy of PatchMatch; the fretboard drawing is ported
from FretFalcon.

## Run

```bash
npm install
```

```bash
npm run dev
```

Opens on http://localhost:5410. On the dev server an orange strip appears across
the top if anything on a page is wider than the screen.

| Command | What it does |
|---|---|
| `npm test` | Vitest: board geometry for both hands, triads, bends and traces, note games (both sweeps), score tables |
| `npm run build` | Typecheck, then build `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:5411 |
| `npm run icons` | Regenerate the PNG icons from `public/icons/icon.svg` |

## The games

| Game | What you do | A run is |
|---|---|---|
| Speed Hunter, by name | A note name is called; tap any fret that plays it | 20 notes; total time, +3 s for a wrong fret |
| Speed Hunter, by ear | A pitch sounds and a string lights up; tap the fret on that string | the same |
| Speed Hunter, advanced | A note name is called with a string or a fret to find it on; only there will do | the same |
| Fret Sweeper, by note | A note is called; tap every fret that plays it, then the next note is called, until the neck is clear | time with a note up, +3 s for a wrong tap |
| Fret Sweeper, random | A note is called; tap one fret that plays it, and a new note is called, until the neck is clear | the same |
| Triads, progressions | Tap three frets on neighbouring strings, then drag anywhere on the board to play the chord | about 12 chords; points for speed and for staying close to the last chord; none for a chord that had to be shown |
| Triads, grid clear | Find every close voicing of one chord on the neck | total time, +3 s for a wrong rake |
| Bend by Ear | Hear a target pitch, push the string until your note matches, let go | 10 bends; points by how many cents off |
| Bend Trace | Hear and see a bend that changes over time, then play it back from memory | 10 bends; points by the mean distance from the prompt |
| Scale Bends | A scale is drawn around the bend, the root in gold and the target note filled in (tap it to hear it); bend from one scale note up to the next | 10 bends; points as in Bend by Ear |

Bend by Ear and Bend Trace come in three tiers (standard, advanced, virtuoso)
that add wider bends. Scale Bends asks for a scale on the panel before
the run: blues (minor pentatonic with the ♭5, which the 4 can be bent over to
the 5), major or natural minor, in a new key every bend. Each scale keeps its
own score table, and the menu's Play button returns to the last one chosen.
Only the root, the note being bent and the target are named on the board. Every game ends on a rank (S, A, B, C), a card of numbers, and a local
top ten with three-letter initials.

The note and triad games take the open strings too: tap on the nut, or in the
ring beside it that carries the string's name. Bends need a fretted note.

In the triad and bend games nothing moves on by itself between prompts: tap the
board, press Next, or press space, and a short beat follows before the next
prompt. Speed Hunter moves on two seconds after an answer, the Next button
draining as it counts; a tap on the board holds the count (and another lets it
go), and a swipe across the board, Next or space goes at once. Fret Sweeper
calls the next note itself, after a beat in which its clock stands still, so the
fret just tapped and the note being called do not sound together. Clocks count
up; nothing expires.

A wrong rake in the progressions keeps the notes it had right (those it shares
with the nearest real voicing), marks each as the root, third or fifth, and
spells the chord in the top row. The fifth wrong rake shows the answer, for no
points. A chord that has been played or shown stays up with each note marked R,
3 or 5.

A wrong tap in Fret Sweeper names the fret that was hit. In Speed Hunter by ear
the pitch can be heard again. In the middle of a run the quit button asks
before it quits.

## Settings

- **Guitar:** right- or left-handed. A left-handed board has the nut on the
  right; the low E string is at the bottom either way (FretFalcon's convention).
- **Neck:** 12 frets by default, shown whole with no scrolling. 15, 17 and 22
  are options; a neck too long for the screen scrolls with a rail under the
  board. Each neck length keeps its own score tables.
- **Sharps and flats:** which names the note games call.

Scores and settings live in the browser's `localStorage`, with export and import
on the Settings page.

## The build

`dist/index.html` is the whole app: JavaScript, CSS and the fonts are inlined,
so the file also runs straight from disk. Beside it sit the three things that
cannot be inlined: `sw.js`, `manifest.webmanifest` and `icons/`. The manifest
asks for landscape and full screen. There is no backend. `Dockerfile` builds
that and serves it from nginx.

## Layout

```
src/core/    pure TypeScript, no DOM or Web Audio; everything here is unit-tested
  music.ts     pitches, note names, the neck, neck sizes
  geometry.ts  where the neck sits on screen and back again (both hands)
  notes.ts     Speed Hunter prompts, Fret Sweeper state
  triads.ts    checking and listing voicings, voice-leading distance, progressions
  bend.ts      bend prompts, travel per string and fret, traces and their scoring
  scaleBend.ts the scales, the bends each offers, Scale Bends prompts
  modes.ts     the list of games, score-table keys, ranks
  storage.ts   the save file and score tables
src/board/   renderer.ts (canvas drawing, ported from FretFalcon),
             board.ts (canvas, sliding window, rail, touches)
src/audio/   audio.ts (plucked and held strings, bends, the arcade noises)
src/app/     dom.ts, router.ts, store.ts, ui.ts, styles/,
             game/ (the screen frame, results, tap-and-rake input), views/
tools/       icons.mjs, devkit.js (drive the board from the console; dev only)
test/
```

Drawing and touch both go through `core/geometry.ts`, so a left-handed board
cannot disagree with its own touch targets.

## Where this differs from the design document

- **Neck:** 12 frets on screen at once by default, not a 7-fret window onto 22.
  Open strings are played, beside the nut; the document's 132 frets become 138
  places on a 22-fret neck, and 78 on the default one.
- **Timing:** no time limits. Speed Hunter is scored on total time, not on
  points that run out at two seconds. Triad time points halve every four
  seconds and never reach zero.
- **Pacing:** the player moves on between prompts in the triad and bend games.
  Speed Hunter counts two seconds and moves on unless held; Fret Sweeper moves
  on after a beat.
- **Speed Hunter, advanced** and the hints and shown answers in the
  progressions are new: neither is in the document.
- **Bend direction:** a drag either way across the neck raises the pitch, as on
  a guitar. (The document says "upward toward the low strings", but the low
  strings are at the bottom.)
- **Bend travel:** how far a semitone is differs by string, by fret (further
  toward fret 12) and by a random 10% either way per prompt, so a bend cannot be
  learned as a distance. The relation between distance and pitch is linear.
- **Bend Trace** and **Scale Bends** are new: neither is in the document.
- **Mis-taps** add 3 seconds; they do not freeze the clock.
- **Fret Sweeper, random** is new: the document has only the note-at-a-time
  sweep.
- **The board** ends at its outer strings, as FretFalcon's does. A touch still
  counts for half a string's gap beyond them.
- **Grid clear:** a found shape is dimmed but its frets stay in play, because
  shapes on neighbouring string sets share frets.
- **Triads:** major, minor and diminished, close-voiced, on all four sets of
  three neighbouring strings. The speed score is not multiplied by a streak.
- **Leaderboards** are local only.

## Not built

Spoken note callouts, other tunings, a limited-time arcade variant, global
leaderboards, a combined rank across games. Ranks, bend travel and the trace
scoring bands are first guesses: nothing here has been played on a real phone
or listened to yet.
