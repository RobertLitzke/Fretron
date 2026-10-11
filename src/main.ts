import './app/styles/app.css';
import { setVoice, setVolume } from './audio/audio';
import { el } from './app/dom';
import { Router } from './app/router';
import { getSave } from './app/store';
import { canFullscreen, toggleFullscreen } from './app/ui';
import { applyLook, clearLook, currentTour } from './app/tour/current';
import { inTour, tourRewrite } from './app/tour/route';
import { watchForUpdates } from './app/update';
import { bendView, traceView } from './app/views/bend';
import { homeView } from './app/views/home';
import { hunterView } from './app/views/hunter';
import { scoresView } from './app/views/scores';
import { scaleBendView } from './app/views/scaleBend';
import { settingsView } from './app/views/settings';
import { sweeperView } from './app/views/sweeper';
import { tourView } from './app/views/tour';
import { gridClearView, triadsView } from './app/views/triads';

const NAV: readonly [string, string][] = [
  ['/home', 'Games'],
  ['/tour', 'Tour'],
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
  setVoice(getSave().voice);

  const markHere = () => {
    const here = location.hash.replace(/^#/, '');
    links.forEach((a, i) => a.classList.toggle('here', here.startsWith(NAV[i][0])));
  };
  window.addEventListener('hashchange', markHere);

  // The tour skin goes on before a view draws: the board reads its colours as it is built.
  const router = new Router(outlet, {
    rewrite: tourRewrite,
    before: (path) => {
      if (inTour(path)) applyLook(currentTour(getSave()));
      else clearLook();
      document.body.classList.toggle('in-tour', path === '/tour');
    },
  });
  router.add('/home', homeView).add('/tour', tourView);
  // Every game plays the same on tour, under /tour.
  for (const base of ['', '/tour']) {
    router
      .add(`${base}/play/hunter/:variant`, hunterView)
      .add(`${base}/play/sweeper/:variant`, sweeperView)
      .add(`${base}/play/triads`, triadsView)
      .add(`${base}/play/triads/:variant`, triadsView)
      .add(`${base}/play/gridclear`, gridClearView)
      .add(`${base}/play/bend/:tier`, bendView)
      .add(`${base}/play/trace/:tier`, traceView)
      .add(`${base}/play/scalebend/:scale`, scaleBendView);
  }
  router
    .add('/scores', scoresView)
    .add('/settings', settingsView)
    .start('/home');
  markHere();

  if (import.meta.env.DEV) void import('./app/overflow').then((m) => m.watchOverflow());

  // The page also runs straight from disk, where there is no service worker.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    watchForUpdates();
  }
}

boot();
