// Which screens are on tour. A game played on tour is its ordinary route under
// /tour, so the games need not know: where one asks to go again it stays on
// tour, and where it asks for the menu it goes back to the map.

export function inTour(path: string): boolean {
  return path === '/tour' || path.startsWith('/tour/');
}

/** Whether the screen showing now is on tour. */
export function onTour(): boolean {
  return inTour(location.hash.replace(/^#/, ''));
}

export function tourRewrite(path: string, here: string): string {
  if (!inTour(here) || inTour(path)) return path;
  if (path.startsWith('/play/')) return `/tour${path}`;
  if (path === '/home') return '/tour';
  return path;
}
