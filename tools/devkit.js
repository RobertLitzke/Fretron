// Dev server only: drive the board from the browser console, to check a game
// without a finger. Load it with
//
//   await import('/tools/devkit.js')
//
// and use the `T` it leaves on window. It relies on `window.__board`, which the
// board sets on the dev server, and `window.__prompt`, which the bend games do.
//
// It also swaps requestAnimationFrame for a timer, because a tab that is not
// being shown gets no animation frames and the games would stand still. Do a
// hash change afterwards (T.go does) so that screens start on the timer.

window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

const NAMES = { C: 0, 'C♯': 1, 'D♭': 1, D: 2, 'D♯': 3, 'E♭': 3, E: 4, F: 5, 'F♯': 6, 'G♭': 6, G: 7, 'G♯': 8, 'A♭': 8, A: 9, 'A♯': 10, 'B♭': 10, B: 11 };
const OPEN = [40, 45, 50, 55, 59, 64];

const T = {
  NAMES,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

  /** A pointer event on the board canvas, at canvas coordinates. */
  ev(type, x, y, id = 1) {
    const canvas = document.querySelector('.board-canvas');
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new PointerEvent(type, { clientX: box.left + x, clientY: box.top + y, pointerId: id, bubbles: true, pointerType: 'touch', isPrimary: true }),
    );
  },

  tap(cell) {
    const p = window.__board.centre(cell);
    T.ev('pointerdown', p.x, p.y);
    T.ev('pointerup', p.x, p.y);
  },

  pcOf: (cell) => (OPEN[cell.string] + cell.fret) % 12,

  cells(first, last) {
    const out = [];
    for (let string = 0; string < 6; string++) for (let fret = first; fret <= last; fret++) out.push({ string, fret });
    return out;
  },

  async go(hash) {
    location.hash = '#/home';
    await T.sleep(100);
    location.hash = hash;
    await T.sleep(300);
  },

  start() {
    document.querySelector('.panel .btn-primary').click();
  },

  text(selector) {
    const node = document.querySelector(selector);
    return node ? node.innerText : null;
  },

  banners: () => [...document.querySelectorAll('.banner')].map((b) => b.innerText),

  /** Pitch classes of "F♯", "A♯m", "B°". */
  chord(name) {
    const m = name.match(/^([A-G][♯♭]?)(m|°)?$/);
    const steps = m[2] === 'm' ? [0, 3, 7] : m[2] === '°' ? [0, 3, 6] : [0, 4, 7];
    return steps.map((i) => (NAMES[m[1]] + i) % 12);
  },

  /** Every close voicing of some chord tones, worked out separately from the app's own list. */
  voicings(tones) {
    const out = [];
    for (let low = 0; low < 4; low++) {
      for (let a = 0; a <= 22; a++) {
        for (let b = 0; b <= 22; b++) {
          for (let c = 0; c <= 22; c++) {
            // Open strings take no finger: the stretch is between the fretted notes.
            const held = [a, b, c].filter((f) => f > 0);
            if (held.length && Math.max(...held) - Math.min(...held) > 4) continue;
            const cells = [{ string: low, fret: a }, { string: low + 1, fret: b }, { string: low + 2, fret: c }];
            const midis = cells.map((x) => OPEN[x.string] + x.fret);
            if (!(midis[0] < midis[1] && midis[1] < midis[2] && midis[2] - midis[0] < 12)) continue;
            const pcs = midis.map((x) => x % 12);
            if (new Set(pcs).size === 3 && pcs.every((p) => tones.includes(p))) out.push(cells);
          }
        }
      }
    }
    return out;
  },

  /** Tap three cells, then drag across their strings. */
  async rake(cells) {
    window.__board.show(cells, true);
    await T.sleep(40);
    for (const cell of cells) {
      T.tap(cell);
      await T.sleep(15);
    }
    const ys = cells.map((c) => window.__board.centre(c).y);
    const x = window.__board.centre(cells[1]).x + 20;
    const from = Math.min(...ys) - 20;
    const to = Math.max(...ys) + 20;
    T.ev('pointerdown', x, from, 7);
    for (let y = from; y <= to; y += 8) T.ev('pointermove', x, y, 7);
    T.ev('pointerup', x, to, 7);
  },

  /** Press the Next button, and wait out the beat before the next prompt. */
  async next() {
    document.querySelector('.hud-action.btn-primary')?.click();
    await T.sleep(700);
  },

  /**
   * Hold the note of the current bend prompt and bend it along `path`: a list of
   * [seconds, cents] to pass through, in a straight line between each. Lifts at
   * the end.
   */
  async bend(path, up = true) {
    const board = window.__board;
    const prompt = window.__prompt;
    const p = board.centre(prompt.cell);
    // The prompt says how far a semitone is, in gaps between strings.
    const px = (cents) => (cents / 100) * prompt.travel * board.layout.spacing * (up ? -1 : 1);
    T.ev('pointerdown', p.x, p.y, 9);
    const t0 = performance.now();
    let [lastT, lastC] = [0, 0];
    for (const [t, cents] of path) {
      for (;;) {
        const now = (performance.now() - t0) / 1000;
        if (now >= t) break;
        const k = t > lastT ? (now - lastT) / (t - lastT) : 1;
        T.ev('pointermove', p.x, p.y + px(lastC + (cents - lastC) * k), 9);
        await T.sleep(12);
      }
      T.ev('pointermove', p.x, p.y + px(cents), 9);
      [lastT, lastC] = [t, cents];
    }
    T.ev('pointerup', p.x, p.y + px(lastC), 9);
  },
};

window.T = T;
export default T;
