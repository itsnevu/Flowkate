import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Cover for `public/buildDomTree.js`, which is injected into pages verbatim and is otherwise
 * untested despite deciding the element indices every model prompt is written against.
 *
 * The one property worth locking down: drawing the numbered overlay is cosmetic, so turning it off
 * must not change which elements get an index or what those indices are. It is easy to break
 * because `handleHighlighting()` returns "this node was indexed" and that return value is what
 * suppresses indices on nested interactive children - so a version that returns it only when it
 * also painted a box quietly renumbers every page. The `naive` case below reproduces exactly that
 * mistake and asserts this suite would catch it.
 *
 * The DOM here is hand-built rather than jsdom: the traversal reads geometry, computed style and
 * hit testing, all of which have to be stated explicitly for the assertions to mean anything, and
 * this workspace has no DOM implementation among its dependencies.
 */

const BUILD_DOM_TREE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../public/buildDomTree.js');
const SOURCE = readFileSync(BUILD_DOM_TREE_PATH, 'utf8');

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementOptions {
  rect?: Rect;
  style?: Record<string, string>;
  offsetWidth?: number;
  offsetHeight?: number;
}

class FakeNode {
  childNodes: any[] = [];
  parentNode: any = null;
  ownerDocument: any = null;
  constructor(public nodeType: number) {}
  get parentElement(): any {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}

class FakeText extends FakeNode {
  nodeName = '#text';
  constructor(public textContent: string) {
    super(3);
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  nodeName: string;
  id: string;
  style: Record<string, string> = {};
  shadowRoot: any = null;
  offsetWidth: number;
  offsetHeight: number;
  private readonly attrs: Record<string, string>;
  private readonly computed: Record<string, string>;
  private readonly rect: Rect;

  constructor(tagName: string, attributes: Record<string, string> = {}, options: ElementOptions = {}) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.attrs = { ...attributes };
    this.id = attributes.id ?? '';
    this.rect = options.rect ?? { x: 0, y: 0, width: 100, height: 30 };
    this.computed = { visibility: 'visible', display: 'block', position: 'static', cursor: 'auto', ...options.style };
    this.offsetWidth = options.offsetWidth ?? this.rect.width;
    this.offsetHeight = options.offsetHeight ?? this.rect.height;
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((n: any) => n.nodeType === 1);
  }
  get className(): string {
    return this.getAttribute('class') ?? '';
  }
  get classList() {
    const classes = this.className.split(/\s+/).filter(Boolean);
    return { contains: (name: string) => classes.includes(name), length: classes.length };
  }
  getComputedStyle(): Record<string, string> {
    return this.computed;
  }
  appendChild(child: any): any {
    if (child?.isFragment) {
      for (const c of [...child.childNodes]) this.appendChild(c);
      return child;
    }
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }
  remove(): void {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return;
    const at = siblings.indexOf(this);
    if (at >= 0) siblings.splice(at, 1);
    this.parentNode = null;
  }
  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }
  getAttributeNames(): string[] {
    return Object.keys(this.attrs);
  }
  isSameNode(other: any): boolean {
    return this === other;
  }
  getRootNode(): any {
    return this.parentNode ? this.parentNode.getRootNode() : this;
  }
  matches(): boolean {
    return false;
  }
  closest(): null {
    return null;
  }
  querySelectorAll(): never[] {
    return [];
  }
  getBoundingClientRect() {
    const r = this.rect;
    return {
      x: r.x,
      y: r.y,
      top: r.y,
      left: r.x,
      width: r.width,
      height: r.height,
      right: r.x + r.width,
      bottom: r.y + r.height,
    };
  }
  getClientRects() {
    const r = this.getBoundingClientRect();
    return r.width === 0 && r.height === 0 ? [] : [r];
  }
}

const el = (
  tagName: string,
  attributes: Record<string, string> = {},
  options: ElementOptions = {},
  children: any[] = [],
) => {
  const element = new FakeElement(tagName, attributes, options);
  for (const child of children) element.appendChild(child);
  return element;
};

const POINTER = { cursor: 'pointer' };

/**
 * A page carrying every shape that decides an index: plain controls, a distinct interactive child
 * inside an interactive parent, a child that is interactive but NOT distinct (the one the parent
 * suppresses, and the only reason the return-value coupling matters), one control below the fold
 * and one with no geometry.
 */
function buildPage() {
  return el('body', {}, { rect: { x: 0, y: 0, width: 1280, height: 2000 } }, [
    el('div', { id: 'toolbar' }, { rect: { x: 0, y: 0, width: 1280, height: 60 } }, [
      el('button', { type: 'button' }, { rect: { x: 10, y: 10, width: 80, height: 30 }, style: POINTER }, [
        new FakeText('Save'),
      ]),
      el('a', { href: '/help' }, { rect: { x: 100, y: 10, width: 60, height: 30 }, style: POINTER }, [
        new FakeText('Help'),
      ]),
    ]),
    el('div', { role: 'button', tabindex: '0' }, { rect: { x: 0, y: 100, width: 400, height: 120 }, style: POINTER }, [
      new FakeText('Card'),
      el('input', { type: 'checkbox' }, { rect: { x: 20, y: 120, width: 20, height: 20 }, style: POINTER }),
      el('button', {}, { rect: { x: 60, y: 120, width: 90, height: 24 }, style: POINTER }, [new FakeText('Buy')]),
      el('span', { onclick: 'x()' }, { rect: { x: 200, y: 120, width: 60, height: 20 }, style: POINTER }, [
        new FakeText('more'),
      ]),
      // interactive only by cursor and distinct by nothing: suppressed while the parent counts as
      // highlighted, and it picks up an index of its own the moment the parent stops counting.
      el('div', { id: 'suppressed' }, { rect: { x: 280, y: 120, width: 80, height: 20 }, style: POINTER }, [
        new FakeText('label'),
        el('em', {}, { rect: { x: 300, y: 122, width: 20, height: 16 }, style: POINTER }, [new FakeText('!')]),
      ]),
    ]),
    el('form', {}, { rect: { x: 0, y: 260, width: 600, height: 200 } }, [
      el(
        'input',
        { type: 'text', name: 'q' },
        { rect: { x: 10, y: 270, width: 200, height: 28 }, style: { cursor: 'text' } },
      ),
      el('textarea', {}, { rect: { x: 10, y: 310, width: 380, height: 80 }, style: { cursor: 'text' } }),
      el('button', { type: 'submit' }, { rect: { x: 10, y: 400, width: 100, height: 32 }, style: POINTER }, [
        new FakeText('Submit'),
      ]),
    ]),
    el('button', {}, { rect: { x: 10, y: 1500, width: 100, height: 30 }, style: POINTER }, [new FakeText('Footer')]),
    el('button', {}, { rect: { x: 0, y: 0, width: 0, height: 0 }, offsetWidth: 0, offsetHeight: 0, style: POINTER }, [
      new FakeText('Hidden'),
    ]),
    el('p', {}, { rect: { x: 10, y: 600, width: 400, height: 40 } }, [new FakeText('Just some prose.')]),
  ]);
}

interface ParseResult {
  /** `index:tag:xpath` for every indexed element, ordered by index. */
  indices: string[];
  containerExists: boolean;
  overlayCount: number;
  listenerCount: number;
  drainListeners: () => number;
}

function parse(source: string, showHighlightElements: boolean, viewportExpansion = 0): ParseResult {
  const body = buildPage();
  const listeners: any[] = [];

  const documentElement = new FakeElement('html');
  const document: any = {
    documentElement,
    body,
    createElement: (tag: string) => {
      const created = new FakeElement(tag);
      created.ownerDocument = document;
      return created;
    },
    createDocumentFragment: () => ({
      isFragment: true,
      childNodes: [] as any[],
      appendChild(c: any) {
        this.childNodes.push(c);
        return c;
      },
    }),
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [] }),
    getElementById: (id: string) => {
      const walk = (node: any): any => {
        if (node.nodeType === 1 && node.id === id) return node;
        for (const child of node.childNodes) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(body);
    },
    // Deepest element covering the point wins. Overlay nodes are pointer-events:none in the real
    // thing, so hit testing looks straight through them - without that, a box the parse just drew
    // would shadow the element it was drawn for and change the result.
    elementFromPoint: (x: number, y: number) => {
      let hit: any = null;
      const walk = (node: any) => {
        if (node.nodeType !== 1 || node.style.pointerEvents === 'none') return;
        const r = node.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = node;
        for (const child of node.childNodes) walk(child);
      };
      walk(body);
      return hit;
    },
  };
  documentElement.ownerDocument = document;
  documentElement.appendChild(body);
  const attach = (node: any) => {
    node.ownerDocument = document;
    for (const child of node.childNodes) attach(child);
  };
  attach(body);

  const win: any = {
    document,
    innerHeight: 800,
    innerWidth: 1280,
    scrollX: 0,
    scrollY: 0,
    getComputedStyle: (element: any) => element.getComputedStyle(),
    addEventListener: (type: string, fn: any, capture?: boolean) => listeners.push({ type, fn, capture }),
    removeEventListener: (type: string, fn: any, capture?: boolean) => {
      const at = listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === capture);
      if (at >= 0) listeners.splice(at, 1);
    },
  };

  vi.stubGlobal('window', win);
  vi.stubGlobal('document', document);
  vi.stubGlobal('Node', { ELEMENT_NODE: 1, TEXT_NODE: 3 });
  vi.stubGlobal('ShadowRoot', class ShadowRoot {});
  vi.stubGlobal('HTMLIFrameElement', class HTMLIFrameElement {});

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(source)();
  const result = win.buildDomTree({
    showHighlightElements,
    focusHighlightIndex: -1,
    viewportExpansion,
    debugMode: false,
    startId: 0,
    startHighlightIndex: 0,
  });

  const indexed = Object.values<any>(result.map)
    .filter(node => node.type !== 'TEXT_NODE' && node.highlightIndex !== undefined)
    .sort((a, b) => a.highlightIndex - b.highlightIndex)
    .map(node => `${node.highlightIndex}:${node.tagName}:${node.xpath}`);

  const container = document.getElementById('playwright-highlight-container');
  return {
    indices: indexed,
    containerExists: Boolean(container),
    overlayCount: container ? container.childNodes.length : 0,
    listenerCount: listeners.length,
    drainListeners: () => {
      for (const cleanup of win._highlightCleanupFunctions ?? []) cleanup();
      return listeners.length;
    },
  };
}

describe('buildDomTree element indexing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('assigns the same indices whether or not the overlay is drawn', () => {
    expect(parse(SOURCE, false).indices).toEqual(parse(SOURCE, true).indices);
  });

  it('assigns the same indices with the overlay off when every element is in scope', () => {
    expect(parse(SOURCE, false, -1).indices).toEqual(parse(SOURCE, true, -1).indices);
  });

  it('still suppresses a non-distinct interactive child of an indexed parent', () => {
    // Without this the equality above would hold trivially - it is the only element whose index
    // depends on its parent's return value.
    const withOverlay = parse(SOURCE, true).indices;
    const withoutOverlay = parse(SOURCE, false).indices;
    expect(withOverlay.some(entry => entry.endsWith('html/body/div[2]'))).toBe(true);
    expect(withOverlay.some(entry => entry.includes('html/body/div[2]/div'))).toBe(false);
    expect(withoutOverlay.some(entry => entry.includes('html/body/div[2]/div'))).toBe(false);
  });

  it('catches a version that ties the return value to the drawing', () => {
    // The mistake this suite exists for: flip the flag through without lifting `return true` out of
    // the draw guard, and the indices move.
    const naive = SOURCE.replace(
      /if \(doHighlightElements\) \{([\s\S]*?)\n {8}\}\n {8}return true;/,
      'if (doHighlightElements) {$1\n          return true;\n        }',
    );
    expect(naive).not.toEqual(SOURCE);
    expect(parse(naive, false).indices).not.toEqual(parse(naive, true).indices);
  });

  it('draws nothing at all when the overlay is off', () => {
    const off = parse(SOURCE, false);
    expect(off.containerExists).toBe(false);
    expect(off.overlayCount).toBe(0);
    expect(off.listenerCount).toBe(0);
  });

  it('parks a cleanup for every listener it registers, so removeHighlights can release them', () => {
    const on = parse(SOURCE, true);
    expect(on.containerExists).toBe(true);
    // two per drawn element: a capture-phase scroll listener and a resize listener
    expect(on.listenerCount).toBe(on.indices.length * 2);
    expect(on.drainListeners()).toBe(0);
  });
});
