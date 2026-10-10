import './app/styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { setVolume } from './audio/audio';
import { el } from './app/dom';
import { Router } from './app/router';
import { getSave } from './app/store';
import { canFullscreen, toast, toggleFullscreen } from './app/ui';
import { bendView, traceView } from './app/views/bend';
import { homeView } from './app/views/home';
import { hunterView } from './app/views/hunter';
import { scoresView } from './app/views/scores';
import { settingsView } from './app/views/settings';
import { sweeperView } from './app/views/sweeper';
import { gridClearView, triadsView } from './app/views/triads';

const NAV: readonly [string, string][] = [
  ['/home', 'Games'],
  ['/scores', 'Scores'],
  ['/settings', 'Settings'],
];

function boot(): void {
  const app = document.getElementById('app')!;
  const links = NAV.map(([path, label]) => el('a', { href: `#${path}` }, label));
  const outlet = el('main');
  app.replaceChildren(
    el(
      'header.topbar',
      {},
      // The T is the last letter of FRET and the first of TRON, and takes neither's colour.
      el('a.wordmark', { href: '#/home' }, 'Fre', el('i', {}, 't'), el('b', {}, 'ron')),
      el(
        'nav',
        {},
        links,
        canFullscreen() ? el('button.nav-full', { type: 'button', 'aria-label': 'Full screen', onclick: toggleFullscreen }, '⛶') : null,
      ),
    ),
    outlet,
  );
  setVolume(getSave().volume);

  const markHere = () => {
    const here = location.hash.replace(/^#/, '');
    links.forEach((a, i) => a.classList.toggle('here', here.startsWith(NAV[i][0])));
  };
  window.addEventListener('hashchange', markHere);

  new Router(outlet)
    .add('/home', homeView)
    .add('/play/hunter/:variant', hunterView)
    .add('/play/sweeper/:variant', sweeperView)
    .add('/play/triads', triadsView)
    .add('/play/gridclear', gridClearView)
    .add('/play/bend/:tier', bendView)
    .add('/play/trace/:tier', traceView)
    .add('/scores', scoresView)
    .add('/settings', settingsView)
    .start('/home');
  markHere();

  if (import.meta.env.DEV) void import('./app/overflow').then((m) => m.watchOverflow());

  // The page also runs straight from disk, where there is no service worker.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const updateSW = registerSW({
      onNeedRefresh() {
        // A banner rather than confirm(): a native dialog would land in the
        // middle of a run. This waits until the player chooses.
        toast('A new version is ready.', { label: 'Reload', run: () => void updateSW(true) });
      },
    });
  }
}

boot();
