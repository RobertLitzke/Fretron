// Dev server only. If anything on the page reaches past the right-hand edge of
// the screen, say what it is in a strip across the top. The page clips sideways
// overflow rather than scrolling, so without this a layout slip on one phone
// would just be a silently cut-off edge.

import { el } from './dom';

export function watchOverflow(): void {
  const alarm = el('div.overflow-alarm', { hidden: true });
  document.body.append(alarm);

  const describe = (node: Element) => {
    const classes = node.getAttribute('class');
    return `<${node.tagName.toLowerCase()}${classes ? '.' + classes.trim().split(/\s+/).join('.') : ''}>`;
  };

  const check = () => {
    const screen = document.documentElement.clientWidth;
    // Mid-resize the page can be measured at no width at all: nothing to say then.
    if (screen === 0) return;
    let worst: Element | null = null;
    let reach = screen + 1;
    for (const node of document.querySelectorAll('#app *')) {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right > reach) {
        reach = box.right;
        worst = node;
      }
    }
    alarm.hidden = worst == null;
    if (worst) {
      alarm.textContent = `Too wide: ${describe(worst)} reaches ${Math.round(reach)} px on a ${screen} px screen, at ${location.hash}`;
    }
  };
  window.setInterval(check, 1000);
}
