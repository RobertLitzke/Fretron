// Minimal hash router. Each view is a factory that renders into a container and
// may return a teardown function. Routes support `:param` segments.

import { el } from './dom';

export interface ViewContext {
  params: Record<string, string>;
  navigate: (path: string) => void;
  /** Go somewhere without leaving a history step behind. */
  replace: (path: string) => void;
}

export type View = (root: HTMLElement, ctx: ViewContext) => void | (() => void);

interface Route {
  segments: string[];
  view: View;
}

export class Router {
  private routes: Route[] = [];
  private teardown: (() => void) | void = undefined;

  constructor(private outlet: HTMLElement) {}

  add(pattern: string, view: View): this {
    this.routes.push({ segments: pattern.split('/').filter(Boolean), view });
    return this;
  }

  start(fallback: string): void {
    const onChange = () => this.resolve(location.hash.replace(/^#/, '') || fallback);
    window.addEventListener('hashchange', onChange);
    if (!location.hash) location.hash = fallback;
    else onChange();
  }

  navigate(path: string, replace = false): void {
    const hash = '#' + path;
    if (hash === location.hash) this.resolve(path);
    else if (replace) {
      // replaceState does not fire hashchange, so the render is on us.
      history.replaceState(null, '', hash);
      this.resolve(path);
    } else location.hash = path;
  }

  private match(path: string): { route: Route; params: Record<string, string> } | null {
    const parts = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  private resolve(path: string): void {
    if (this.teardown) {
      this.teardown();
      this.teardown = undefined;
    }
    this.outlet.replaceChildren();
    window.scrollTo(0, 0);
    const matched = this.match(path);
    if (!matched) {
      this.outlet.replaceChildren(
        el('div.page', {}, el('p.muted', {}, 'Nothing here.'), el('a.btn', { href: '#/home' }, 'Home')),
      );
      return;
    }
    const result = matched.route.view(this.outlet, {
      params: matched.params,
      navigate: (p) => this.navigate(p),
      replace: (p) => this.navigate(p, true),
    });
    if (typeof result === 'function') this.teardown = result;
  }
}
