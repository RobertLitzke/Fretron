// Tiny hyperscript-style DOM helper. Keeps view code declarative without a
// framework. `el('div.card', { onclick }, ...children)`.

export type Child = Node | string | number | null | undefined | false | Child[];

interface Props {
  [key: string]: unknown;
  onclick?: (e: MouseEvent) => void;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration> | string;
}

function append(node: Element, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function el(selector: string, props: Props = {}, ...children: Child[]): HTMLElement {
  const [tag, ...rest] = selector.split(/(?=[.#])/);
  const node = document.createElement(tag || 'div');
  for (const token of rest) {
    if (token.startsWith('.')) node.classList.add(token.slice(1));
    else if (token.startsWith('#')) node.id = token.slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'onclick') node.addEventListener('click', v as EventListener);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style') {
      if (typeof v === 'string') node.setAttribute('style', v);
      else Object.assign(node.style, v);
    } else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  node.append(...children);
  return node;
}
