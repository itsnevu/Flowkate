import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Page from '../page';
import { DOMElementNode, type DOMState } from '../dom/views';
import type { PageState } from '../views';

/**
 * Cover for what `Page` reports when it cannot read the page in front of it.
 *
 * The failure this pins down is a silent one. `_updateState` used to answer every parse failure with
 * the last state that worked, which reads as harmless until you notice the state carries the element
 * indices the model clicks by: the model is handed a tree belonging to a page the tab has already
 * left, with no signal that anything went wrong, and spends its remaining steps clicking indices
 * that resolve to nothing. Losing the tree is recoverable; being lied to about which page you are on
 * is not, which is why the assertions below are about honesty rather than completeness.
 *
 * The DOM service is mocked out because none of that plumbing is what is under test here - only how
 * Page reacts to it succeeding, failing, or failing and then succeeding.
 */

const domService = vi.hoisted(() => ({
  getClickableElements: vi.fn(),
  removeHighlights: vi.fn(async () => undefined),
  getScrollInfo: vi.fn(async () => [120, 800, 2400] as [number, number, number]),
}));

vi.mock('../dom/service', () => domService);
// Both refuse to load outside a real extension, and neither is reachable from the paths under test.
vi.mock('webextension-polyfill', () => ({ default: {} }));
vi.mock('puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js', () => ({
  connect: vi.fn(),
  ExtensionTransport: { connectTab: vi.fn() },
}));

const BROKEN_URL = 'https://example.com/gone';
const PREVIOUS_URL = 'https://example.com/results';

/** A parse result standing in for a page that was read successfully. */
function domStateWith(tagName: string): DOMState {
  const root = new DOMElementNode({
    tagName,
    xpath: '',
    attributes: {},
    children: [],
    isVisible: true,
    parent: null,
  });
  const button = new DOMElementNode({
    tagName: 'button',
    xpath: '/body/button',
    attributes: {},
    children: [],
    isVisible: true,
    isInteractive: true,
    highlightIndex: 0,
    parent: root,
  });
  root.children.push(button);
  return { elementTree: root, selectorMap: new Map([[0, button]]) };
}

function fakePuppeteerPage() {
  return {
    evaluate: vi.fn(async () => undefined),
    url: vi.fn(() => BROKEN_URL),
    title: vi.fn(async () => 'Site cannot be reached'),
    screenshot: vi.fn(async () => 'c2NyZWVuc2hvdA=='),
  };
}

/**
 * A Page already holding the state of a page it has since navigated away from - the state that must
 * not be handed back once the current one turns out to be unreadable.
 */
function pageCarryingPreviousState() {
  const page = new Page(1, BROKEN_URL, 'Site cannot be reached');
  const internals = page as unknown as { _puppeteerPage: unknown; _state: PageState };
  internals._puppeteerPage = fakePuppeteerPage();

  const previous = domStateWith('body');
  internals._state.url = PREVIOUS_URL;
  internals._state.title = 'Search results';
  internals._state.elementTree = previous.elementTree;
  internals._state.selectorMap = previous.selectorMap;
  internals._state.scrollY = 640;
  return page;
}

/** Drive a state update past the grounding retry delays without waiting on them. */
async function updateState(page: InstanceType<typeof Page>): Promise<PageState> {
  const pending = page._updateState();
  await vi.advanceTimersByTimeAsync(5_000);
  return pending;
}

describe('Page state when the DOM cannot be read', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    domService.getClickableElements.mockReset();
    domService.removeHighlights.mockClear();
    domService.getScrollInfo.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not pass off the previous page as the current one', async () => {
    domService.getClickableElements.mockRejectedValue(new Error('Frame with ID 0 is showing error page'));
    const page = pageCarryingPreviousState();

    const state = await updateState(page);

    expect(state.url).toBe(BROKEN_URL);
    expect(state.title).toBe('Site cannot be reached');
    expect(state.selectorMap.size).toBe(0);
    expect(state.elementTree.children).toHaveLength(0);
  });

  it('flags the page as ungrounded and falls back to a screenshot', async () => {
    domService.getClickableElements.mockRejectedValue(new Error('Frame with ID 0 is showing error page'));
    const page = pageCarryingPreviousState();

    const state = await updateState(page);

    // Without both of these the prompt has no grounding at all: no tree, and no picture either.
    expect(state.domGroundingFailed).toBe(true);
    expect(state.screenshot).toBe('c2NyZWVuc2hvdA==');
  });

  it('clears scroll figures measured on the page that is gone', async () => {
    domService.getClickableElements.mockRejectedValue(new Error('Frame with ID 0 is showing error page'));
    const page = pageCarryingPreviousState();

    const state = await updateState(page);

    // Carried forward, these invite a scroll against a page that is no longer there.
    expect(state.scrollY).toBe(0);
    expect(state.scrollHeight).toBe(0);
    expect(state.visualViewportHeight).toBe(0);
  });

  it('retries a thrown parse rather than giving up on the first one', async () => {
    domService.getClickableElements
      .mockRejectedValueOnce(new Error('Frame with ID 3 was removed'))
      .mockResolvedValue(domStateWith('main'));
    const page = pageCarryingPreviousState();

    const state = await updateState(page);

    // A frame navigating out from under the parse is exactly what the retries exist for; before,
    // only an empty result got them, and a throw skipped straight past.
    expect(state.elementTree.tagName).toBe('main');
    expect(state.selectorMap.size).toBe(1);
    expect(state.domGroundingFailed).toBe(false);
    expect(state.url).toBe(BROKEN_URL);
  });

  it('keeps the parsed tree when only the trimmings fail', async () => {
    domService.getClickableElements.mockResolvedValue(domStateWith('main'));
    domService.getScrollInfo.mockRejectedValue(new Error('Frame with ID 0 is showing error page'));
    const page = pageCarryingPreviousState();

    const state = await updateState(page);

    // The DOM was read before this failed, so the tree describes the page in front of us and is
    // worth more than the scroll numbers that went missing with it.
    expect(state.elementTree.tagName).toBe('main');
  });
});
