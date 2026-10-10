// Picks up a new deploy without a hard refresh.
//
// Each build's service worker lists index.html with a hash of its contents, so
// a changed build is a changed sw.js. The browser only looks at sw.js when a
// page is navigated to, though, and an installed app on a phone is mostly
// resumed from the background rather than opened afresh. So this also asks for
// an update whenever the app comes back to the foreground. A new worker waits
// until the player taps Reload.

import { registerSW } from 'virtual:pwa-register';
import { el } from './dom';

/** Don't look again sooner than this after the last look. */
const MIN_GAP_MS = 60 * 1000;

export function watchForUpdates(): void {
  let lastCheck = Date.now();

  const updateSW = registerSW({
    onNeedRefresh() {
      showBanner(() => void updateSW(true));
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = async () => {
        if (Date.now() - lastCheck < MIN_GAP_MS) return;
        if (registration.installing || !navigator.onLine) return;
        lastCheck = Date.now();
        // Asking while the server is unreachable would log a failed update, so
        // make sure sw.js can be fetched first.
        try {
          const resp = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (resp.status === 200) await registration.update();
        } catch {
          // Offline or flaky: try again next time.
        }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check();
      });
      window.addEventListener('focus', () => void check());
    },
  });
}

/**
 * A banner rather than confirm(): a native dialog would land in the middle of a
 * run. It is apart from toast() so that a passing toast cannot knock it away,
 * and it stays until the player reloads or dismisses it.
 */
function showBanner(reload: () => void): void {
  if (document.querySelector('.update-banner')) return;
  const node = el(
    'div.toast.update-banner',
    { role: 'status' },
    'A new version is ready.',
    el('button.btn.btn-small', { type: 'button', onclick: () => { node.remove(); reload(); } }, 'Reload'),
    el('button.update-dismiss', { type: 'button', 'aria-label': 'Later', onclick: () => node.remove() }, '×'),
  );
  document.body.append(node);
}
