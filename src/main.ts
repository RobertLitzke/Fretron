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
import { songTraceView } from './app/views/song';
import { homeView } from './app/views/home';
import { hunterView } from './app/views/hunter';
import { referenceView } from './app/views/reference';
import { scoresView } from './app/views/scores';
import { scaleBendView } from './app/views/scaleBend';
import { scaleBuilderView } from './app/views/scaleBuilder';
import { settingsView } from './app/views/settings';
import { sweeperView } from './app/views/sweeper';
import { tourView } from './app/views/tour';
import { gridClearView, triadsView } from './app/views/triads';

const NAV: readonly [string, string][] = [
  ['/home', 'Games'],
  ['/tour', 'Tour'],
  ['/reference', 'Reference'],
  ['/scores', 'Scores'],
  ['/settings', 'Settings'],
];

function boot(): void {
  const app = document.getElementById('app')!;
  const links = NAV.map(([path, label]) => el('a', { href: `#${path}`, role: 'menuitem' }, label));
  // Too many places for a row of tabs on a phone: one button names where you are and opens the rest.
  const current = el('span');
  const toggle = el('button.nav-toggle', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, current, el('i', { 'aria-hidden': 'true' }, '▾')) as HTMLButtonElement;
  const menu = el('div.nav-menu', { role: 'menu', hidden: true }, links);
  const nav = el('nav', {}, el('div.nav-drop', {}, toggle, menu), canFullscreen() ? el('button.nav-full', { type: 'button', 'aria-label': 'Full screen', onclick: toggleFullscreen }, '⛶') : null);
  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  const outlet = el('main');
  app.replaceChildren(
    el(
      'header.topbar',
      {},
      // The T is the last letter of FRET and the first of TRON, and takes neither's colour.
      el('a.wordmark', { href: '#/home' }, 'Fre', el('i', {}, 't'), el('b', {}, 'ron')),
      nav,
    ),
    outlet,
  );
  setVolume(getSave().volume);
  setVoice(getSave().voice);

  const markHere = () => {
    const here = location.hash.replace(/^#/, '');
    const at = NAV.findIndex(([path]) => here.startsWith(path));
    links.forEach((a, i) => a.classList.toggle('here', i === at));
    current.textContent = at < 0 ? 'Menu' : NAV[at][1];
    setOpen(false);
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
      .add(`${base}/play/song/:song/trace`, songTraceView)
      .add(`${base}/play/scalebend/:scale`, scaleBendView)
      .add(`${base}/play/scales/:level/:scale`, scaleBuilderView);
  }
  router
    .add('/reference', (_root, ctx) => ctx.replace(`/reference/${getSave().picks['ref-tab'] === 'triads' ? 'triads' : 'notes'}`))
    .add('/reference/:tab', referenceView)
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
