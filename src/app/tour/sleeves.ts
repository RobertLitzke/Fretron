// The album sleeves on the tour: one small drawing per leg, each a nod to a
// rock cover of its genre, drawn here from scratch. Plain SVG strings, 100 by
// 100. The first six keep their own colours; the rest take the tour's genre
// colours (--ink, --paper, --rust, --mustard, --olive in styles/tour.css).

import type { Sleeve } from '../../core/tour';

const INK = '#3b2416';
const CREAM = '#f1e2c0';
const RUST = '#c8502a';
const MUSTARD = '#e3a72f';
const OLIVE = '#8fa33a';
const TEAL = '#2e6b68';

/** Rays from a point, alternating two colours: a sunburst. */
function rays(cx: number, cy: number, n: number, r: number, a: string, b: string): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * 2 * Math.PI;
    const t1 = ((i + 1) / n) * 2 * Math.PI;
    const p = (t: number) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
    out += `<path d="M${cx} ${cy} L${p(t0)} L${p(t1)}Z" fill="${i % 2 ? a : b}"/>`;
  }
  return out;
}

/** A fill from the genre's palette. */
const f = (token: 'ink' | 'paper' | 'rust' | 'mustard' | 'olive') => `style="fill:var(--${token})"`;
const sk = (token: 'ink' | 'paper' | 'rust' | 'mustard' | 'olive', width: number) =>
  `style="fill:none;stroke:var(--${token});stroke-width:${width}"`;

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  }
  return d + 'Z';
}

const BOLT = 'M58 8 L30 54 L48 54 L38 92 L72 40 L53 40 L66 8Z';

const SLEEVES: Record<Sleeve, string> = {
  // A single on a sunburst: where everyone starts.
  record: `
    <rect width="100" height="100" fill="${MUSTARD}"/>
    ${rays(50, 50, 24, 90, MUSTARD, '#efc25a')}
    <circle cx="50" cy="50" r="34" fill="${INK}"/>
    <circle cx="50" cy="50" r="28" fill="none" stroke="#5a3a26" stroke-width=".8"/>
    <circle cx="50" cy="50" r="22" fill="none" stroke="#5a3a26" stroke-width=".8"/>
    <circle cx="50" cy="50" r="12" fill="${RUST}"/>
    <path d="M52 40 L45 51 L50 51 L47 60 L55 48 L50 48Z" fill="${CREAM}"/>`,

  // A pig floating over a power station's four chimneys.
  pig: `
    <rect width="100" height="100" fill="#9aa3a0"/>
    <rect y="62" width="100" height="38" fill="#5d5a52"/>
    <rect x="22" y="44" width="56" height="30" fill="#4a463f"/>
    <rect x="18" y="20" width="6" height="44" fill="#d9d2c0"/><rect x="34" y="20" width="6" height="26" fill="#d9d2c0"/>
    <rect x="60" y="20" width="6" height="26" fill="#d9d2c0"/><rect x="76" y="20" width="6" height="44" fill="#d9d2c0"/>
    <path d="M51 30 Q54 20 60 18" fill="none" stroke="${INK}" stroke-width=".6"/>
    <ellipse cx="62" cy="15" rx="10" ry="6" fill="#e9a5a0"/>
    <circle cx="71" cy="14" r="3" fill="#e9a5a0"/><circle cx="72.5" cy="14" r=".8" fill="${INK}"/>
    <path d="M57 10 L59 6 L61 10Z M63 10 L65 6 L67 10Z" fill="#d98f8a"/>
    <rect x="56" y="19" width="2" height="4" fill="#d98f8a"/><rect x="66" y="19" width="2" height="4" fill="#d98f8a"/>`,

  // White light into a prism, a spectrum out.
  prism: `
    <rect width="100" height="100" fill="#141010"/>
    <path d="M0 62 L44 48" stroke="${CREAM}" stroke-width="2"/>
    ${['#d0402a', '#e07f2a', '#e3c13a', '#7aa33a', '#2e7f9a', '#6a4a9a']
      .map((c, i) => `<path d="M56 50 L100 ${50 + i * 4} L100 ${54 + i * 4}Z" fill="${c}"/>`)
      .join('')}
    <path d="M50 26 L72 66 L28 66Z" fill="none" stroke="${CREAM}" stroke-width="2.4"/>`,

  // An airship over the clouds, in sepia.
  airship: `
    <rect width="100" height="100" fill="#d9c49a"/>
    <ellipse cx="48" cy="40" rx="34" ry="12" fill="#6b4a2a"/>
    <path d="M18 36 L20 44 M78 40 L86 32 L86 48Z" fill="#4a2e1a" stroke="#4a2e1a" stroke-width="2"/>
    <path d="M22 40 H78" stroke="#8a6a45" stroke-width=".8"/>
    <path d="M30 34 Q48 30 70 34" fill="none" stroke="#8a6a45" stroke-width=".8"/>
    <rect x="42" y="51" width="12" height="5" rx="1" fill="#4a2e1a"/>
    <path d="M0 80 Q12 68 24 78 Q34 66 48 76 Q60 64 74 76 Q86 66 100 74 V100 H0Z" fill="#f1e2c0"/>
    <path d="M0 90 Q16 80 30 88 Q46 78 62 88 Q80 80 100 86 V100 H0Z" fill="#e6d0a1"/>`,

  // A figure on a hill at night, holding up a lantern with a star in it.
  lantern: `
    <rect width="100" height="100" fill="#1f2a3a"/>
    <circle cx="20" cy="18" r="1" fill="${CREAM}"/><circle cx="82" cy="12" r="1" fill="${CREAM}"/><circle cx="70" cy="28" r=".8" fill="${CREAM}"/><circle cx="12" cy="40" r=".8" fill="${CREAM}"/>
    <path d="M0 78 Q40 58 100 70 V100 H0Z" fill="#2c3a2a"/>
    <path d="M44 66 Q42 52 48 44 Q54 44 56 52 L58 66Z" fill="#5a4a3a"/>
    <circle cx="50" cy="42" r="4" fill="#5a4a3a"/>
    <path d="M56 50 L64 40" stroke="#5a4a3a" stroke-width="2"/>
    <circle cx="66" cy="38" r="8" fill="${MUSTARD}" opacity=".35"/>
    <rect x="63" y="34" width="6" height="8" fill="${MUSTARD}"/>
    <path d="M66 35 L67 38 L70 38 L67.5 39.6 L68.5 42 L66 40.5 L63.5 42 L64.5 39.6 L62 38 L65 38Z" fill="${CREAM}"/>`,

  // A rising sun behind a snowcapped mountain.
  sun: `
    <rect width="100" height="100" fill="${CREAM}"/>
    ${rays(50, 62, 16, 110, CREAM, '#e9c4a8')}
    <circle cx="50" cy="56" r="22" fill="${RUST}"/>
    <path d="M0 100 L50 50 L100 100Z" fill="${TEAL}"/>
    <path d="M40 60 L50 50 L60 60 L55 58 L50 62 L45 58Z" fill="${CREAM}"/>
    <rect y="94" width="100" height="6" fill="${OLIVE}"/>`,

  // A crescent moon in a night sky.
  moon: `
    <rect width="100" height="100" ${f('ink')}/>
    <circle cx="50" cy="50" r="32" ${f('paper')}/>
    <circle cx="64" cy="42" r="28" ${f('ink')}/>
    <path d="${starPath(76, 70, 5, 2)}" ${f('mustard')}/><path d="${starPath(70, 22, 3, 1.2)}" ${f('paper')}/><path d="${starPath(24, 84, 3, 1.2)}" ${f('paper')}/>`,

  // A raven on a bare branch, against a full moon.
  raven: `
    <rect width="100" height="100" ${f('rust')}/>
    <circle cx="58" cy="40" r="26" ${f('paper')}/>
    <path d="M0 76 Q40 70 100 80 L100 84 Q40 74 0 80Z" ${f('ink')}/>
    <path d="M70 80 L64 66 Q60 54 50 50 Q44 42 36 44 L30 40 L34 47 Q30 52 34 58 Q42 66 52 70 L58 80Z" ${f('ink')}/>
    <circle cx="38" cy="46" r="1.2" ${f('paper')}/>`,

  // A dark tower under a lightning bolt, one window lit.
  tower: `
    <rect width="100" height="100" ${f('mustard')}/>
    <path d="M78 0 L66 22 L74 22 L62 44" ${sk('paper', 3)}/>
    <path d="M36 100 L40 40 L36 34 L36 26 L42 26 L42 30 L48 30 L48 26 L54 26 L54 30 L60 30 L60 26 L66 26 L66 34 L62 40 L66 100Z" ${f('ink')}/>
    <rect x="49" y="48" width="4" height="8" ${f('paper')}/>
    <rect y="92" width="100" height="8" ${f('ink')}/>`,

  // An open eye, rayed like a sun.
  eye: `
    <rect width="100" height="100" ${f('ink')}/>
    ${Array.from({ length: 16 }, (_, i) => {
      const t = (i / 16) * 2 * Math.PI;
      return `<path d="M${(50 + 30 * Math.cos(t)).toFixed(1)} ${(50 + 30 * Math.sin(t)).toFixed(1)} L${(50 + 46 * Math.cos(t)).toFixed(1)} ${(50 + 46 * Math.sin(t)).toFixed(1)}" ${sk('mustard', 3)}/>`;
    }).join('')}
    <path d="M14 50 Q50 18 86 50 Q50 82 14 50Z" ${f('paper')}/>
    <circle cx="50" cy="50" r="15" ${f('rust')}/>
    <circle cx="50" cy="50" r="7" ${f('ink')}/>
    <circle cx="54" cy="46" r="2.5" ${f('paper')}/>`,

  // A lightning bolt across a face-round disc.
  bolt: `
    <rect width="100" height="100" ${f('paper')}/>
    <circle cx="50" cy="50" r="38" ${f('mustard')}/>
    <path d="${BOLT}" ${f('rust')}/>
    <path d="${BOLT}" ${sk('ink', 2)}/>`,

  // A target roundel, as on a parka.
  roundel: `
    <rect width="100" height="100" ${f('paper')}/>
    <circle cx="50" cy="50" r="42" ${f('olive')}/>
    <circle cx="50" cy="50" r="28" ${f('paper')}/>
    <circle cx="50" cy="50" r="15" ${f('rust')}/>`,

  // A submarine in a cartoon sea.
  submarine: `
    <rect width="100" height="100" ${f('olive')}/>
    <path d="M0 74 Q12 68 25 74 T50 74 T75 74 T100 74 V100 H0Z" ${f('paper')} opacity=".35"/>
    <path d="M14 54 Q14 40 32 40 L70 40 Q86 40 86 54 Q86 66 70 66 L32 66 Q14 66 14 54Z" ${f('mustard')}/>
    <rect x="46" y="26" width="16" height="16" rx="3" ${f('mustard')}/>
    <path d="M54 26 V16 H62" ${sk('ink', 2.5)}/>
    <circle cx="36" cy="53" r="5" ${f('paper')}/><circle cx="52" cy="53" r="5" ${f('paper')}/><circle cx="68" cy="53" r="5" ${f('paper')}/>
    <path d="M86 54 L94 46 L94 62Z" ${f('rust')}/>`,

  // Four figures on a zebra crossing.
  crossing: `
    <rect width="100" height="100" ${f('olive')}/>
    <rect y="58" width="100" height="42" ${f('ink')}/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${4 + i * 16}" y="62" width="9" height="34" ${f('paper')}/>`).join('')}
    ${[18, 38, 58, 78]
      .map(
        (x) =>
          `<circle cx="${x}" cy="34" r="4" ${f('ink')}/><path d="M${x - 3} 39 H${x + 3} L${x + 2} 52 L${x + 6} 62 L${x + 3} 62 L${x} 54 L${x - 3} 62 L${x - 6} 62 L${x - 2} 52Z" ${f('ink')}/>`,
      )
      .join('')}`,

  // A guitar, body and neck.
  guitar: `
    <rect width="100" height="100" ${f('mustard')}/>
    <rect x="46" y="6" width="8" height="50" ${f('ink')}/>
    <rect x="43" y="4" width="14" height="10" rx="2" ${f('ink')}/>
    <circle cx="50" cy="62" r="20" ${f('rust')}/>
    <circle cx="50" cy="80" r="16" ${f('rust')}/>
    <circle cx="50" cy="64" r="6" ${f('ink')}/>
    <rect x="42" y="78" width="16" height="4" ${f('ink')}/>`,

  // A spiral, the way a light show turns.
  spiral: `
    <rect width="100" height="100" ${f('mustard')}/>
    ${[44, 36, 28, 20, 12].map((r, i) => `<circle cx="50" cy="50" r="${r}" ${f(i % 2 ? 'olive' : 'rust')}/>`).join('')}
    <path d="M50 50 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16 a20 20 0 1 1 -20 -20 a24 24 0 1 1 24 24" ${sk('paper', 2.5)}/>`,

  // A safety pin on a torn scrap.
  pin: `
    <rect width="100" height="100" ${f('rust')}/>
    <path d="M10 22 L86 14 L80 40 L92 52 L84 86 L14 90 L20 60 L8 46Z" ${f('paper')}/>
    <path d="M24 70 L72 30" ${sk('ink', 3)}/>
    <path d="M30 74 L76 36 Q82 30 76 26 Q70 22 66 28" ${sk('ink', 3)}/>
    <circle cx="26" cy="72" r="5" ${sk('ink', 3)}/>
    <rect x="62" y="22" width="14" height="10" rx="2" transform="rotate(-40 69 27)" ${f('mustard')}/>`,

  // A crown, cut out like a ransom note.
  crown: `
    <rect width="100" height="100" ${f('mustard')}/>
    <path d="M20 70 L16 34 L34 50 L50 26 L66 50 L84 34 L80 70Z" ${f('paper')}/>
    <path d="M20 70 L16 34 L34 50 L50 26 L66 50 L84 34 L80 70Z" ${sk('ink', 3)}/>
    <rect x="18" y="72" width="64" height="10" ${f('ink')}/>
    <rect x="8" y="10" width="40" height="12" transform="rotate(-6 28 16)" ${f('rust')}/>
    <rect x="56" y="84" width="34" height="10" transform="rotate(4 73 89)" ${f('rust')}/>`,

  // A star with sparkles.
  star: `
    <rect width="100" height="100" ${f('ink')}/>
    <path d="${starPath(50, 54, 38, 16)}" ${f('mustard')}/>
    <path d="${starPath(50, 54, 38, 16)}" ${sk('rust', 3)}/>
    <path d="${starPath(18, 18, 7, 2)}" ${f('paper')}/><path d="${starPath(84, 22, 5, 1.5)}" ${f('paper')}/><path d="${starPath(82, 86, 6, 1.8)}" ${f('olive')}/>`,
};

export function sleeveSvg(sleeve: Sleeve): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${SLEEVES[sleeve]}</svg>`;
}
