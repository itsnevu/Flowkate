/**
 * main.ts — the landing page's conductor.
 *
 * Owns every runtime behaviour on the page: smooth scrolling (Lenis), anchor
 * navigation, scroll-linked reveals, the sticky header state, the three.js hero
 * scene's scroll progress, and the quickstart copy buttons.
 *
 * Two rules shape the whole file:
 *
 * 1. There is exactly ONE requestAnimationFrame loop here, and all it does is
 *    tick Lenis. Everything scroll-linked hangs off Lenis' own `scroll` event
 *    instead of polling, so we never run two loops against each other.
 * 2. `prefers-reduced-motion: reduce` takes a genuinely different path: no
 *    Lenis, no rAF loop, no observers — native scrolling and everything
 *    revealed up front.
 * 3. Nothing here waits on three.js. The scene is imported dynamically and is
 *    the last thing requested, so the page is readable and interactive whether
 *    or not that chunk ever arrives.
 */
import './style.css';
import Lenis from 'lenis';

// Must stay the first statement in the module. style.css hides `.reveal` behind
// `html.js .reveal`, so this class is the promise that something is alive to add
// `.is-visible` later. If this script never runs (parse error, blocked bundle),
// the class never lands and the page renders fully visible instead of blank.
document.documentElement.classList.add('js');

/** Scroll distance, in px, after which the fixed header switches to its condensed state. */
const STUCK_AFTER = 40;
/** Breathing room left between the bottom of the fixed header and an anchor target. */
const ANCHOR_GAP = 16;
/** Stagger index cap, so a long list never waits seconds for its last item. */
const MAX_STAGGER_STEPS = 6;
/** How long the "Copied" confirmation stays on a copy button. */
const COPY_FEEDBACK_MS = 1800;
/** Progress deltas smaller than this are not worth waking the hero scene for. */
const PROGRESS_EPSILON = 0.0005;

/**
 * The shape `main.ts` needs back from `initScene`. `scene.ts` owns the real
 * implementation; this is deliberately structural so the two files only have to
 * agree on `setScroll`, and either spelling of teardown is accepted.
 */
type SceneHandle = {
  setScroll(progress: number): void;
  dispose?: () => void;
  destroy?: () => void;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Removes every listener registered below in one call during teardown. */
const controller = new AbortController();
const { signal } = controller;

/** Pending timeouts, tracked so teardown cannot leave one firing into a dead DOM. */
const timeouts = new Set<number>();

const later = (fn: () => void, ms: number): number => {
  const id = window.setTimeout(() => {
    timeouts.delete(id);
    fn();
  }, ms);
  timeouts.add(id);
  return id;
};

/* -------------------------------------------------------------------------- */
/* Elements                                                                    */
/* -------------------------------------------------------------------------- */

const nav = document.querySelector<HTMLElement>('header.nav');
const hero = document.getElementById('hero');
const canvas = document.querySelector<HTMLCanvasElement>('canvas#scene');

/* -------------------------------------------------------------------------- */
/* Hero scene                                                                  */
/* -------------------------------------------------------------------------- */

let scene: SceneHandle | null = null;

const disposeScene = (): void => {
  if (!scene) return;
  try {
    if (scene.dispose) scene.dispose();
    else if (scene.destroy) scene.destroy();
  } catch (error) {
    console.warn('[flowkite] hero scene teardown failed:', error);
  }
  scene = null;
};

/**
 * Fetches the hero scene *off* the critical path.
 *
 * three.js is roughly half a megabyte — more than fifteen times the rest of this
 * page put together — and nothing above the fold depends on it. A static import
 * would drag it into the entry chunk, so the first reveal could not paint until
 * the whole renderer had downloaded, parsed and compiled. Imported dynamically,
 * the ~30 kB entry runs immediately and the backdrop attaches whenever (or if)
 * its chunk lands.
 *
 * Called once, below, after everything else on the page is already live.
 */
const loadScene = async (): Promise<void> => {
  if (!canvas) return;
  try {
    const { initScene } = await import('./scene');
    // Teardown can easily win the race against a network fetch. Attaching now
    // would hand a WebGL context to a page that has no way left to dispose it.
    if (signal.aborted) return;
    scene = initScene(canvas);
    // The reader has very likely scrolled while the chunk was in flight, so seed
    // the scene with where the page actually is rather than leaving it at t=0.
    lastProgress = -1;
    applyScroll(lenis ? lenis.scroll : window.scrollY);
  } catch (error) {
    // A failed chunk or a WebGL failure must never take the rest of the page down
    // with it — the hero simply renders without its backdrop.
    console.warn('[flowkite] hero scene unavailable:', error);
    scene = null;
  }
};

/**
 * Hero height is cached rather than measured per scroll event: reading
 * `offsetHeight` inside the scroll callback would force a layout on every
 * frame of every scroll.
 */
let heroHeight = hero?.offsetHeight ?? 0;

if (hero && typeof ResizeObserver !== 'undefined') {
  // Catches viewport resizes *and* late reflows (web fonts, images) in one go.
  const heroResize = new ResizeObserver(() => {
    heroHeight = hero.offsetHeight;
  });
  heroResize.observe(hero);
  signal.addEventListener('abort', () => heroResize.disconnect(), { once: true });
} else if (hero) {
  window.addEventListener('resize', () => (heroHeight = hero.offsetHeight), { passive: true, signal });
}

/* -------------------------------------------------------------------------- */
/* Scroll-linked state                                                         */
/* -------------------------------------------------------------------------- */

let stuck = false;
let lastProgress = -1;

/**
 * The single place scroll position is turned into page state. Called from the
 * Lenis `scroll` event when Lenis is running, and from a passive native scroll
 * listener when reduced motion has taken Lenis out of the picture.
 */
const applyScroll = (scrollY: number): void => {
  const nextStuck = scrollY > STUCK_AFTER;
  if (nextStuck !== stuck) {
    stuck = nextStuck;
    nav?.classList.toggle('is-stuck', nextStuck);
  }

  const activeScene = scene;
  if (!activeScene) return;

  // Fall back to the viewport height so a not-yet-measured hero still yields a
  // sane 0→1 ramp instead of dividing by zero.
  const basis = heroHeight > 0 ? heroHeight : window.innerHeight;
  const progress = basis > 0 ? clamp(scrollY / basis, 0, 1) : 0;
  if (Math.abs(progress - lastProgress) <= PROGRESS_EPSILON) return;
  lastProgress = progress;

  try {
    activeScene.setScroll(progress);
  } catch (error) {
    // Context loss would otherwise throw on every single scroll frame.
    console.warn('[flowkite] hero scene disabled after error:', error);
    scene = null;
  }
};

/* -------------------------------------------------------------------------- */
/* Smooth scrolling                                                            */
/* -------------------------------------------------------------------------- */

let lenis: Lenis | null = null;
let rafId = 0;
const previousScrollBehavior = document.documentElement.style.scrollBehavior;

const frame = (time: number): void => {
  lenis?.raf(time);
  rafId = requestAnimationFrame(frame);
};

const startLoop = (): void => {
  if (!lenis || rafId !== 0) return;
  rafId = requestAnimationFrame(frame);
};

const stopLoop = (): void => {
  if (rafId === 0) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
};

if (!prefersReducedMotion) {
  lenis = new Lenis({
    // A calm, slightly heavy glide rather than a springy one.
    lerp: 0.09,
    smoothWheel: true,
    // Touch devices already scroll well natively; hijacking them costs more
    // than it buys.
    syncTouch: false,
    // Lenis' built-in `anchors` handling is deliberately left off (its default):
    // the click handler below needs to offset targets past the fixed header.
  });

  // CSS `scroll-behavior: smooth` fights Lenis for control of the same scroll
  // position. Neutralise it while Lenis owns scrolling, and restore on teardown
  // so the reduced-motion/native path keeps whatever the stylesheet asked for.
  document.documentElement.style.scrollBehavior = 'auto';

  lenis.on('scroll', () => {
    // Read from the instance rather than the callback argument: `lenis.scroll`
    // is the smoothed position that the page is actually painted at.
    if (lenis) applyScroll(lenis.scroll);
  });

  startLoop();
}

// Prime header + scene state for the position the page actually loads at
// (restored scroll, deep link, refresh mid-page).
applyScroll(lenis ? lenis.scroll : window.scrollY);

if (!lenis) {
  // Reduced motion: native scrolling drives the same state machine. Cheap
  // enough to run unthrottled because `applyScroll` reads no layout.
  window.addEventListener('scroll', () => applyScroll(window.scrollY), { passive: true, signal });
}

/* -------------------------------------------------------------------------- */
/* Anchor navigation                                                           */
/* -------------------------------------------------------------------------- */

/** Distance an anchor target must clear to sit below the fixed header. */
const headerOffset = (): number => (nav ? nav.getBoundingClientRect().height + ANCHOR_GAP : ANCHOR_GAP);

/** `decodeURIComponent` throws on malformed input (`#100%`), which must not break the click handler. */
const decodeId = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const scrollToHash = (hash: string, immediate = false): boolean => {
  if (!lenis) return false;

  if (hash === '#') {
    lenis.scrollTo(0, { immediate });
    return true;
  }

  // `getElementById` sidesteps CSS-escaping problems with ids that contain
  // characters `querySelector` would choke on.
  const target = document.getElementById(decodeId(hash.slice(1)));
  if (!target) return false;

  lenis.scrollTo(target, { offset: -headerOffset(), immediate });

  // Keyboard and screen-reader users need focus to follow the scroll, or the
  // next Tab press resumes from wherever they were before.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });

  return true;
};

// Delegated so anchors rendered at any point still work, and so the page only
// carries one click listener.
document.addEventListener(
  'click',
  (event: MouseEvent) => {
    if (!lenis) return; // Reduced motion: let the browser do its native jump.
    // Let the browser handle modified clicks (new tab, download, …) untouched.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor || anchor.target === '_blank') return;

    const hash = anchor.getAttribute('href');
    if (!hash) return;
    if (!scrollToHash(hash)) return;

    event.preventDefault();
    // pushState keeps the URL honest without the browser's instant jump, and
    // leaves a history entry so Back returns to the previous section.
    if (hash !== window.location.hash) window.history.pushState(null, '', hash);
  },
  { signal },
);

window.addEventListener(
  'popstate',
  () => {
    if (!lenis) return;
    scrollToHash(window.location.hash || '#');
  },
  { signal },
);

// A deep link lands before Lenis exists, so the browser's native jump ignores
// the fixed header. Re-seat the target on the next frame, without animating.
if (lenis && window.location.hash) {
  requestAnimationFrame(() => scrollToHash(window.location.hash, true));
}

/* -------------------------------------------------------------------------- */
/* Reveal on scroll                                                            */
/* -------------------------------------------------------------------------- */

const reveals = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));

// Stagger is expressed as a `--i` index per element; the actual delay curve
// lives in style.css, where it can be tuned without touching this file.
//
// This loop is the SOLE owner of `--i`. Do not put `style="--i: N"` back into
// index.html: hand-written indices go stale the moment an element is inserted,
// removed or reordered, and they are silently overwritten here anyway.
const seenPerParent = new Map<Element, number>();
for (const el of reveals) {
  const parent = el.parentElement;
  if (!parent) {
    el.style.setProperty('--i', '0');
    continue;
  }
  const index = seenPerParent.get(parent) ?? 0;
  seenPerParent.set(parent, index + 1);
  el.style.setProperty('--i', String(Math.min(index, MAX_STAGGER_STEPS)));
}

if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
  // No animation to schedule: show everything, immediately.
  for (const el of reveals) el.classList.add('is-visible');
} else if (reveals.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        // Reveals are one-shot; stop paying for elements already shown.
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
  );

  for (const el of reveals) revealObserver.observe(el);
  signal.addEventListener('abort', () => revealObserver.disconnect(), { once: true });
}

/* -------------------------------------------------------------------------- */
/* Quickstart: copy to clipboard                                               */
/* -------------------------------------------------------------------------- */

/**
 * Progressive enhancement, in the strict sense: if the section, the code
 * blocks, or the Clipboard API are missing, the markup is left exactly as the
 * server sent it.
 *
 * This is the only function on the page that mutates the DOM, so it returns the
 * closure that undoes it. Without that, every Vite hot update would append a
 * second live region and a second Copy button to every `<pre>`.
 */
const setUpCopyButtons = (): (() => void) => {
  /** Nodes this function added, so teardown can put the document back as it found it. */
  const created: Element[] = [];
  /** `<pre>` elements this function flagged, for the same reason. */
  const decorated: Element[] = [];

  const cleanUp = (): void => {
    for (const node of created) node.remove();
    for (const block of decorated) block.classList.remove('has-copy');
    created.length = 0;
    decorated.length = 0;
  };

  const quickstart = document.getElementById('quickstart');
  if (!quickstart) return cleanUp;
  // Absent on insecure origins — better no button than a dead one.
  if (!navigator.clipboard?.writeText) return cleanUp;

  const blocks = quickstart.querySelectorAll('pre');
  if (blocks.length === 0) return cleanUp;

  // One polite live region for the whole page, hidden by the shared `.sr-only`
  // rule in style.css.
  const status = document.createElement('div');
  status.className = 'sr-only';
  status.setAttribute('aria-live', 'polite');
  document.body.append(status);
  created.push(status);

  blocks.forEach(block => {
    // Capture the snippet BEFORE inserting the button, otherwise the button's
    // own label is swept into the clipboard along with the code.
    const source = block.querySelector('code') ?? block;
    const snippet = (source.textContent ?? '').trim();
    if (!snippet) return;

    const button = document.createElement('button');
    button.type = 'button';
    // Deliberately NOT a `.key`: the shared key is a pale, raised surface lit from
    // the upper-left, and painting one onto a dark graphite code slab inverts the
    // light direction. `.copy` in style.css is the graphite-native variant.
    button.className = 'copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy command to clipboard');
    block.classList.add('has-copy');
    block.append(button);
    created.push(button);
    decorated.push(block);

    let restoreId = 0;

    const flash = (label: string, announcement: string): void => {
      button.textContent = label;
      button.dataset.copied = 'true';
      status.textContent = announcement;

      if (restoreId !== 0) {
        window.clearTimeout(restoreId);
        timeouts.delete(restoreId);
      }
      restoreId = later(() => {
        button.textContent = 'Copy';
        delete button.dataset.copied;
        status.textContent = '';
        restoreId = 0;
      }, COPY_FEEDBACK_MS);
    };

    button.addEventListener(
      'click',
      () => {
        void navigator.clipboard.writeText(snippet).then(
          () => flash('Copied', 'Command copied to clipboard'),
          () => flash('Copy failed', 'Copy failed — select the command and copy it manually'),
        );
      },
      { signal },
    );
  });

  return cleanUp;
};

const cleanUpCopyButtons = setUpCopyButtons();

/* -------------------------------------------------------------------------- */
/* Hero scene: requested last                                                  */
/* -------------------------------------------------------------------------- */

// Everything above is already interactive; the heavy chunk is only asked for now.
// `void` because `loadScene` swallows its own failures — there is nothing left to
// handle, and an unmarked promise here would read as an oversight.
void loadScene();

/* -------------------------------------------------------------------------- */
/* Teardown                                                                    */
/* -------------------------------------------------------------------------- */

const teardown = (): void => {
  stopLoop();
  for (const id of timeouts) window.clearTimeout(id);
  timeouts.clear();
  // Before the abort, so the buttons are gone while their listeners still are.
  cleanUpCopyButtons();
  // Fires the abort listeners above (observers) and drops every DOM listener.
  // Also latches `signal.aborted`, which is what stops an in-flight `loadScene`
  // from attaching a scene to a page that is already being dismantled.
  controller.abort();
  disposeScene();
  lenis?.destroy();
  lenis = null;
  document.documentElement.style.scrollBehavior = previousScrollBehavior;
};

window.addEventListener('pagehide', (event: PageTransitionEvent) => {
  // A persisted (bfcache) hide can be revived by `pageshow`, so only park the
  // rAF loop there — a full teardown would restore a dead, unscrollable page.
  if (event.persisted) {
    stopLoop();
    return;
  }
  teardown();
});

window.addEventListener(
  'pageshow',
  (event: PageTransitionEvent) => {
    if (event.persisted) startLoop();
  },
  { signal },
);

// Vite HMR: without this, every hot update would stack another Lenis instance
// and another rAF loop on top of the last.
if (import.meta.hot) {
  import.meta.hot.dispose(() => teardown());
}
