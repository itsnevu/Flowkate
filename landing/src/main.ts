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
/**
 * Data saver is a promise the browser made on the user's behalf, and the scene is
 * exactly the half-megabyte of decoration it exists to skip. Slow cellular gets the
 * same courtesy. The hero copy stands on its own either way.
 */
const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const constrainedData = connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? '');

const loadScene = async (): Promise<void> => {
  if (!canvas || constrainedData) return;
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
/** The back-to-top key; created later, once, in its own section below. */
let totop: HTMLButtonElement | null = null;
/** The reading-progress hairline, created alongside it. */
let progressBar: HTMLElement | null = null;

/**
 * How far the page can scroll, cached for the same reason `heroHeight` is:
 * `scrollHeight` is a layout read, and the progress bar updates on every frame
 * of every scroll.
 */
let maxScroll = 0;

const measureScrollRange = (): void => {
  maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
};

measureScrollRange();

if (typeof ResizeObserver !== 'undefined') {
  // The body, not the viewport: sections that reveal, fonts that land late and
  // FAQ items that open all change the scrollable range without a resize event.
  const rangeObserver = new ResizeObserver(measureScrollRange);
  rangeObserver.observe(document.body);
  signal.addEventListener('abort', () => rangeObserver.disconnect(), { once: true });
} else {
  window.addEventListener('resize', measureScrollRange, { passive: true, signal });
}

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

  // A viewport down is where "scroll back" starts beating "just scroll" — earlier
  // than that the button is noise next to the hero.
  totop?.classList.toggle('is-visible', scrollY > window.innerHeight);

  if (progressBar) {
    progressBar.style.transform = `scaleX(${maxScroll > 0 ? clamp(scrollY / maxScroll, 0, 1) : 0})`;
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

/**
 * Sections below the fold use `content-visibility: auto`, so their heights are
 * estimates until they render — and a scroll target computed over estimates lands
 * hundreds of pixels off. This class forces real layout for the duration of the
 * glide; the safety timeout covers a scroll that Lenis abandons midway (user
 * grabbed the wheel), where onComplete never fires. Leaving the class on merely
 * costs the optimisation, but the timeout keeps even that window short.
 */
let anchoringSafetyId = 0;

const endAnchoring = (): void => {
  document.documentElement.classList.remove('is-anchoring');
  if (anchoringSafetyId !== 0) {
    window.clearTimeout(anchoringSafetyId);
    timeouts.delete(anchoringSafetyId);
    anchoringSafetyId = 0;
  }
};

const beginAnchoring = (): void => {
  endAnchoring(); // reset any glide already in flight
  document.documentElement.classList.add('is-anchoring');
  anchoringSafetyId = later(() => {
    anchoringSafetyId = 0;
    endAnchoring();
  }, 3000);
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

  beginAnchoring();
  lenis.scrollTo(target, { offset: -headerOffset(), immediate, onComplete: endAnchoring });

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
/**
 * Which flavour of entrance an element gets. Decided here rather than spelled
 * out in the markup so all three language pages inherit it from one bundle, and
 * so a new section picks up the right motion by being the right kind of thing.
 * Every class it can return is defined in style.css; returning null leaves the
 * element on the base rise-and-focus.
 */
const revealVariant = (el: HTMLElement): string | null => {
  if (el.tagName === 'H2') return 'reveal--wipe';
  if (el.classList.contains('chips')) return 'reveal--stagger';
  // The hero's pull-quote sits to the side of the measure, so it arrives across.
  if (el.classList.contains('hero__try')) return 'reveal--slide-l';
  if (
    el.classList.contains('plate') ||
    el.classList.contains('faq__item') ||
    el.classList.contains('demo') ||
    el.classList.contains('cta')
  ) {
    return 'reveal--card';
  }
  return null;
};

const seenPerParent = new Map<Element, number>();
for (const el of reveals) {
  const variant = revealVariant(el);
  if (variant) el.classList.add(variant);

  // Chips carry their own stagger index, since the parent hands them its entrance.
  if (el.classList.contains('chips')) {
    Array.from(el.children).forEach((chip, index) => {
      if (chip instanceof HTMLElement) chip.style.setProperty('--ci', String(index));
    });
  }

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
/* Demo replay                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The side-panel mocks in #demo play once, when the demo scrolls into view: the
 * active panel gets `.is-playing` and style.css owns every beat from there (each
 * element carries its own `--d` delay in the markup — choreography, not the
 * reveal stagger).
 *
 * `.is-playing` is also the visibility latch: `html.js` blanks a panel's beats,
 * so whichever path runs here MUST end in the class or the panel stays empty.
 * That is why reduced motion and a missing IntersectionObserver both add it to
 * every panel immediately — the global reduced-motion rule zeroes the delays,
 * so doing so shows the finished conversations as stills.
 *
 * Two scenarios share the stage behind an ARIA tab pair. Switching tabs swaps
 * the `hidden` panel and replays the incoming one from its first beat — a replay
 * is the whole point of choosing a scenario.
 */
const demoTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.demo__tab'));
const demoPanels = Array.from(document.querySelectorAll<HTMLElement>('.demo__panel'));

if (demoPanels.length > 0) {
  const panelFor = (tab: HTMLButtonElement): HTMLElement | null => {
    const id = tab.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };

  const activePanel = (): HTMLElement => demoPanels.find(panel => !panel.hidden) ?? demoPanels[0];

  const play = (panel: HTMLElement): void => {
    panel.classList.remove('is-playing');
    // Forces a style flush between remove and add; without it the browser
    // coalesces the two into "no change" and no animation restarts.
    void panel.offsetWidth;
    panel.classList.add('is-playing');
  };

  const selectTab = (tab: HTMLButtonElement): void => {
    const target = panelFor(tab);
    if (!target || !target.hidden) return; // already showing

    for (const other of demoTabs) {
      const chosen = other === tab;
      other.setAttribute('aria-selected', String(chosen));
      // Roving tabindex, per the ARIA tabs pattern: one tab stop for the list.
      other.tabIndex = chosen ? 0 : -1;
    }
    for (const panel of demoPanels) panel.hidden = panel !== target;
    play(target);
  };

  demoTabs.forEach((tab, tabIndex) => {
    tab.addEventListener('click', () => selectTab(tab), { signal });
    tab.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = demoTabs[(tabIndex + step + demoTabs.length) % demoTabs.length];
        next.focus();
        selectTab(next);
        event.preventDefault();
      },
      { signal },
    );
  });

  if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
    // No animation to schedule: every panel becomes its finished still, so tab
    // switches under reduced motion swap complete conversations.
    for (const panel of demoPanels) panel.classList.add('is-playing');
  } else {
    const demoObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          play(activePanel());
          // One-shot: once the replay has started there is nothing left to watch.
          observer.disconnect();
        }
      },
      // Waits for a third of the panel so the opening beats are not spent
      // below the fold, half-scrolled-into.
      { threshold: 0.35 },
    );
    demoObserver.observe(demoPanels[0]);
    signal.addEventListener('abort', () => demoObserver.disconnect(), { once: true });

    const replay = document.querySelector<HTMLButtonElement>('.demo__replay');
    replay?.addEventListener('click', () => play(activePanel()), { signal });
  }
}

/* -------------------------------------------------------------------------- */
/* Mobile menu                                                                 */
/* -------------------------------------------------------------------------- */

const menuButton = document.querySelector<HTMLButtonElement>('.nav__menu');

if (nav && menuButton) {
  const header = nav;
  const button = menuButton;

  const setMenu = (open: boolean): void => {
    header.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => setMenu(!header.classList.contains('is-open')), { signal });

  document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !header.classList.contains('is-open')) return;
      setMenu(false);
      // Focus was likely inside the sheet, which display:none just destroyed;
      // hand it back to the control that reopens it.
      button.focus();
    },
    { signal },
  );

  // Closing on any document click covers both cases at once: a sheet link was
  // chosen (the smooth-scroll handler above still receives the same event —
  // display:none on the sheet does not stop the scroll already dispatched), or
  // the tap landed outside the header entirely.
  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (!header.classList.contains('is-open')) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.nav__menu')) return; // the toggle manages itself
      if (target.closest('a[href^="#"]') || !target.closest('header.nav')) setMenu(false);
    },
    { signal },
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ deep links                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A link to a single question has to arrive with that question open, or it lands on
 * a wall of collapsed summaries and the deep link was pointless. The ids are shared
 * across the language pages, so /pt-BR/#faq-keys reaches the same answer.
 *
 * `scrollToHash` already handles the travel; this only owns the disclosure state.
 */
const openFaqFromHash = (hash: string): void => {
  if (!hash.startsWith('#faq-')) return;
  const target = document.getElementById(decodeId(hash.slice(1)));
  if (target instanceof HTMLDetailsElement) target.open = true;
};

openFaqFromHash(window.location.hash);
window.addEventListener('hashchange', () => openFaqFromHash(window.location.hash), { signal });

// The delegated anchor handler prevents default and drives Lenis itself, so a click
// on an in-page FAQ link never fires `hashchange`. Catch those on the way past.
document.addEventListener(
  'click',
  (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#faq-"]');
    if (anchor) openFaqFromHash(anchor.getAttribute('href') ?? '');
  },
  { signal },
);

/* -------------------------------------------------------------------------- */
/* Hero: rotating task examples                                                */
/* -------------------------------------------------------------------------- */

/**
 * Types out a rotation of concrete tasks in the hero chip. The examples live on the
 * element (data-tasks), not here: each language page carries its own set, so this
 * file stays locale-agnostic. The first entry mirrors the markup's static text
 * exactly, so the handoff from server HTML to the first erase is invisible. Reduced
 * motion never starts the rotation — the static example stands. Every delay goes
 * through `later`, so teardown stops the typing mid-word.
 */
const setUpTaskRotation = (): void => {
  if (prefersReducedMotion) return;
  const chip = document.getElementById('hero-task');
  if (!chip) return;

  let tasks: unknown;
  try {
    tasks = JSON.parse(chip.dataset.tasks ?? '[]');
  } catch {
    return; // malformed attribute: leave the static example alone
  }
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.some(task => typeof task !== 'string')) return;
  const examples = tasks as string[];

  // Quote marks are part of the page's language (zh-TW uses 「」), so the page
  // supplies them; typing happens inside the quotes.
  const quoteOpen = chip.dataset.quoteOpen ?? '“';
  const quoteClose = chip.dataset.quoteClose ?? '”';

  const HOLD_MS = 3800;
  const TYPE_MS = 26;
  const ERASE_MS = 11;

  let index = 0;
  const render = (text: string): void => {
    chip.textContent = `${quoteOpen}${text}${quoteClose}`;
  };

  /**
   * Set while a pointer rests on the chip or focus is inside it. Only checked
   * between examples, never mid-word: pausing halfway through typing would read
   * as the page having stalled rather than as a deliberate hold.
   */
  let paused = false;
  // The whole pill, not just the text node: a bigger, more forgiving hover target,
  // and the one a reader's cursor actually lands on.
  const hoverTarget = chip.closest<HTMLElement>('.hero__try') ?? chip;
  const hold = (): void => {
    paused = true;
  };
  const release = (): void => {
    paused = false;
  };
  hoverTarget.addEventListener('pointerenter', hold, { signal });
  hoverTarget.addEventListener('pointerleave', release, { signal });
  hoverTarget.addEventListener('focusin', hold, { signal });
  hoverTarget.addEventListener('focusout', release, { signal });

  const cycle = (): void => {
    // Someone is reading this one. Keep it on screen and ask again shortly.
    if (paused) {
      later(cycle, 600);
      return;
    }

    const current = examples[index];
    let pos = current.length;

    const eraseTick = (): void => {
      pos -= 1;
      render(current.slice(0, pos));
      if (pos > 0) {
        later(eraseTick, ERASE_MS);
        return;
      }

      index = (index + 1) % examples.length;
      const next = examples[index];
      let typed = 0;

      const typeTick = (): void => {
        typed += 1;
        render(next.slice(0, typed));
        if (typed < next.length) {
          later(typeTick, TYPE_MS);
          return;
        }
        later(cycle, HOLD_MS);
      };

      // A breath between erasing one task and typing the next.
      later(typeTick, 240);
    };

    later(eraseTick, ERASE_MS);
  };

  later(cycle, HOLD_MS + 1400);
};

setUpTaskRotation();

/* -------------------------------------------------------------------------- */
/* Reading progress                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A hairline across the top edge, scaled to how far down the page the reader is.
 * Created here rather than in the markup for the same reason as the button
 * below: one bundle, three language pages, nothing to keep in sync by hand.
 *
 * Left out entirely under reduced motion — a bar that tracks the scroll is
 * motion the reader did not ask for, and it carries no information the
 * scrollbar is not already giving them.
 */
if (!prefersReducedMotion) {
  const bar = document.createElement('div');
  bar.className = 'progress';
  // Decorative: it mirrors the scrollbar, so it has nothing to announce.
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  progressBar = bar;
}

/* -------------------------------------------------------------------------- */
/* Card sheen                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Moves each card's highlight toward the pointer. The gradient itself lives in
 * style.css and already has a sensible resting position, so this only ever
 * refines an effect that is complete without it — which is why the whole thing
 * is skipped on touch, where there is no pointer to follow.
 *
 * This does read layout per move, but only while the pointer is genuinely over
 * a card, and pointer events are already coalesced to one per frame.
 */
if (window.matchMedia('(hover: hover)').matches) {
  document.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>('.plate, .faq__item');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    },
    { passive: true, signal },
  );
}

/* -------------------------------------------------------------------------- */
/* Back to top                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A single fixed key that appears once the reader is a viewport down and glides
 * back to the start. Created here rather than in the markup so every language
 * page gets it from the shared bundle — only the label is per-language. Under
 * reduced motion the ride is an instant jump, matching native anchor behaviour.
 */
const setUpBackToTop = (): void => {
  const labels: Record<string, string> = {
    en: 'Back to top',
    'pt-BR': 'Voltar ao topo',
    'zh-TW': '回到頂端',
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'totop';
  button.setAttribute('aria-label', labels[document.documentElement.lang] ?? labels.en);
  // Static, trusted markup — a chevron cut from the same stroke style as the glyphs.
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">' +
    '<path d="m5 14 7-7 7 7" stroke-linecap="round" stroke-linejoin="round" /></svg>';

  button.addEventListener(
    'click',
    () => {
      if (lenis) lenis.scrollTo(0);
      else window.scrollTo(0, 0);
      // Focus follows the ride for keyboard users, same dance as the anchor
      // handler: <main> is only focusable once it carries a tabindex.
      const main = document.getElementById('main');
      if (main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
    },
    { signal },
  );

  document.body.append(button);
  totop = button;
};

setUpBackToTop();

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
  totop?.remove();
  totop = null;
  progressBar?.remove();
  progressBar = null;
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
