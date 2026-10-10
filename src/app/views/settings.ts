import { pluck, setVoice, setVolume, strum, unlock, type Voice } from '../../audio/audio';
import type { Hand } from '../../core/geometry';
import { NECK_SIZES } from '../../core/music';
import type { Accidentals } from '../../core/notes';
import { emptySave } from '../../core/storage';
import { el } from '../dom';
import type { View } from '../router';
import { exportSave, getSave, importSave, setSave, updateSave } from '../store';
import { canFullscreen, page, segmented, toast, toggleFullscreen } from '../ui';

export const settingsView: View = (root) => {
  const render = () => {
    const save = getSave();

    const volume = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(save.volume), 'aria-label': 'Volume' }) as HTMLInputElement;
    volume.addEventListener('input', () => {
      const v = Number(volume.value);
      updateSave((s) => ({ ...s, volume: v }));
      setVolume(v);
    });
    volume.addEventListener('change', () => {
      unlock();
      pluck(57);
    });

    const download = () => {
      const url = URL.createObjectURL(new Blob([exportSave()], { type: 'application/json' }));
      const a = el('a', { href: url, download: 'fretron-scores.json' });
      a.click();
      URL.revokeObjectURL(url);
    };

    const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      if (!confirm('Replace all scores and settings in this browser with the contents of that file?')) return;
      toast(importSave(await chosen.text()) ? 'Scores imported' : 'That file is not a Fretron export');
      file.value = '';
      render();
    });

    const reset = () => {
      if (!confirm('Erase all scores and settings in this browser?')) return;
      setSave(emptySave());
      toast('Scores erased');
      render();
    };

    const view = page(
        el('h1', {}, 'Settings'),
        el(
          'section',
          {},
          el('h2', {}, 'Board'),
          el(
            'div.row',
            {},
            el('span', {}, 'Guitar'),
            segmented<Hand>(
              [
                { value: 'left', label: 'Left-handed' },
                { value: 'right', label: 'Right-handed' },
              ],
              save.hand,
              (hand) => updateSave((s) => ({ ...s, hand })),
            ),
          ),
          el('p.note', {}, 'A left-handed board has the nut on the right. The low E string is at the bottom either way.'),
          el(
            'div.row',
            {},
            el('span', {}, 'Neck'),
            segmented<number>(
              NECK_SIZES.map((n) => ({ value: n, label: `${n} frets` })),
              save.frets,
              (frets) => updateSave((s) => ({ ...s, frets })),
            ),
          ),
          el('p.note', {}, 'Twelve frets fit on the screen whole. A longer neck may have to scroll, and keeps its own score tables.'),
          el(
            'div.row',
            {},
            el('span', {}, 'Sharps and flats'),
            segmented<Accidentals>(
              [
                { value: 'mixed', label: 'Both' },
                { value: 'sharp', label: 'Sharps' },
                { value: 'flat', label: 'Flats' },
              ],
              save.accidentals,
              (accidentals) => updateSave((s) => ({ ...s, accidentals })),
            ),
          ),
        ),
        el(
          'section',
          {},
          el('h2', {}, 'Sound and screen'),
          el('label.row', {}, el('span', {}, 'Volume'), volume),
          el(
            'div.row',
            {},
            el('span', {}, 'Voice'),
            segmented<Voice>(
              [
                { value: 'synth', label: 'Synth' },
                { value: 'guitar', label: 'Guitar' },
              ],
              save.voice,
              (voice) => {
                updateSave((s) => ({ ...s, voice }));
                setVoice(voice);
                unlock();
                strum([55, 59, 62]);
              },
            ),
          ),
          el('p.note', {}, 'Synth is the original tone. Guitar is an electric with a little overdrive.'),
          canFullscreen() ? el('div.row', {}, el('button.btn', { type: 'button', onclick: toggleFullscreen }, 'Full screen on / off')) : null,
        ),
        el(
          'section',
          {},
          el('h2', {}, 'Scores'),
          el('p.note', {}, 'Scores and settings are kept in this browser only. Export them to move to another device or to keep a backup.'),
          el(
            'div.row',
            {},
            el('button.btn', { type: 'button', onclick: download }, 'Export'),
            el('button.btn', { type: 'button', onclick: () => file.click() }, 'Import'),
            el('button.btn', { type: 'button', onclick: reset }, 'Erase'),
            file,
          ),
        ),
        el('section', {}, el('h2', {}, 'About'), el('p.note', {}, `Fretron ${__APP_VERSION__}. Standard tuning.`)),
    );
    view.classList.add('settings');
    root.replaceChildren(view);
  };
  render();
};
