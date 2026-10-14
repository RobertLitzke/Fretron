// Low notes sound quieter than high ones at the same level: the ear (and a
// phone's speaker) hears little of a low string's fundamental. This evens them
// out: each note's level is scaled by how loud that voice sounds at its pitch.
//
// The tables are each voice's measured loudness: one pluck at level 0.5,
// rendered offline through the whole chain, A-weighted. The whole gap is made
// up: at 70% Rob still heard the low strings as too quiet. The middle of the
// neck (E4, the open top string) is left as it was; notes below are raised and
// notes above lowered, within limits, so that a low chord does not drive the
// limiter too hard.

import type { Voice } from './audio';

/** The pitches the voices were measured at. */
const MEASURED_AT = [40, 45, 50, 55, 59, 64, 69, 74, 79, 84, 88];

/** Each voice's loudness (dB, A-weighted) at those pitches. */
const MEASURED: Record<Voice, readonly number[]> = {
  synth: [51.2, 54.2, 56.8, 59.3, 61.0, 63.0, 64.7, 66.1, 67.2, 68.0, 68.3],
  guitar: [65.0, 63.7, 62.3, 62.4, 64.5, 65.0, 65.9, 66.9, 68.3, 69.3, 69.5],
};

/** The pitch whose level is left alone. */
const REFERENCE = 64;
/** How much of the measured gap is made up. */
const SHARE = 1;
/** The most a note is raised, and lowered, in dB. */
const MAX_BOOST = 12;
const MAX_CUT = 5;

/** A voice's measured loudness at a pitch, between the measured ones. */
function measured(voice: Voice, midi: number): number {
  const table = MEASURED[voice];
  const last = MEASURED_AT.length - 1;
  if (midi <= MEASURED_AT[0]) return table[0];
  if (midi >= MEASURED_AT[last]) return table[last];
  let i = 0;
  while (MEASURED_AT[i + 1] < midi) i++;
  const f = (midi - MEASURED_AT[i]) / (MEASURED_AT[i + 1] - MEASURED_AT[i]);
  return table[i] + f * (table[i + 1] - table[i]);
}

/** The factor to scale a note's level by so that it sounds as loud as the others. */
export function loudnessGain(voice: Voice, midi: number): number {
  const db = SHARE * (measured(voice, REFERENCE) - measured(voice, midi));
  return 10 ** (Math.max(-MAX_CUT, Math.min(MAX_BOOST, db)) / 20);
}
