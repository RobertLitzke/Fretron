// The album sleeves on the tour: one small drawing per leg, each a nod to a
// 1970s rock cover, drawn here from scratch. Plain SVG strings, 100 by 100.

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
};

export function sleeveSvg(sleeve: Sleeve): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${SLEEVES[sleeve]}</svg>`;
}
