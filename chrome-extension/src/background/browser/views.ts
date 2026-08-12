import type { DOMState } from './dom/views';
import type { DOMHistoryElement } from './dom/history/view';

export interface BrowserContextWindowSize {
  width: number;
  height: number;
}

export interface BrowserContextConfig {
  /**
   * Minimum time to wait before getting page state for LLM input
   * @default 0.25
   */
  minimumWaitPageLoadTime: number;

  /**
   * Time to wait for network requests to finish before getting page state.
   * Lower values may result in incomplete page loads.
   * @default 0.5
   */
  waitForNetworkIdlePageLoadTime: number;

  /**
   * Maximum time to wait for page load before proceeding anyway
   * @default 5.0
   */
  maximumWaitPageLoadTime: number;

  /**
   * Extra fixed pad after the adaptive page-load wait between actions in one step, in seconds.
   *
   * Defaults to 0 because `waitForPageAndFramesLoad` already runs between actions and adapts to the
   * page (~0.6s typically). This is the escape hatch for pages that settle later than the network
   * suggests - a JS-driven re-render after load, say - not the primary settle.
   * @default 0
   */
  waitBetweenActions: number;

  /**
   * Default browser window size
   * @default { width: 1280, height: 1100 }
   */
  browserWindowSize: BrowserContextWindowSize;

  /**
   * Viewport expansion in pixels. This amount will increase the number of elements
   * which are included in the state what the LLM will see.
   * If set to -1, all elements will be included (this leads to high token usage).
   * If set to 0, only the elements which are visible in the viewport will be included.
   * @default 0
   */
  viewportExpansion: number;

  /**
   * List of allowed domains that can be accessed. If None, all domains are allowed.
   * @default null
   */
  allowedUrls: string[];

  /**
   * List of denied domains that can be accessed. If None, all domains are allowed.
   * @default null
   */
  deniedUrls: string[];

  /**
   * Include dynamic attributes in the CSS selector. If you want to reuse the css_selectors, it might be better to set this to False.
   * @default true
   */
  includeDynamicAttributes: boolean;

  /**
   * Home page url
   * @default 'https://www.google.com'
   */
  homePageUrl: string;

  /**
   * Display highlights on interactive elements
   * @default true
   */
  displayHighlights: boolean;

  /**
   * Collect every tab the agent drives into one labelled Chrome tab group, so the user can tell
   * which tabs are being automated. Purely a disclosure affordance - it never gates automation.
   * @default true
   */
  groupTabs: boolean;
}

export const DEFAULT_BROWSER_CONTEXT_CONFIG: BrowserContextConfig = {
  minimumWaitPageLoadTime: 0.25,
  waitForNetworkIdlePageLoadTime: 0.5,
  maximumWaitPageLoadTime: 5.0,
  waitBetweenActions: 0,
  browserWindowSize: { width: 1280, height: 1100 },
  viewportExpansion: 0,
  allowedUrls: [],
  deniedUrls: [],
  includeDynamicAttributes: true,
  homePageUrl: 'about:blank',
  displayHighlights: true,
  groupTabs: true,
};

export interface PageState extends DOMState {
  tabId: number;
  url: string;
  title: string;
  screenshot: string | null;
  /**
   * True when DOM parsing found no interactive elements even after retrying. Client-rendered apps,
   * canvas UIs and cross-origin iframes all produce this, and it is the signal to fall back to the
   * screenshot instead of telling the model the page is simply empty.
   */
  domGroundingFailed?: boolean;
  scrollY: number;
  scrollHeight: number;
  visualViewportHeight: number;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
}

export interface BrowserState extends PageState {
  tabs: TabInfo[];
  // browser_errors: string[];
}

export class BrowserStateHistory {
  url: string;
  title: string;
  tabs: TabInfo[];
  interactedElements: (DOMHistoryElement | null)[];
  // screenshot is too large to store in the history
  // screenshot: string | null;

  constructor(state: BrowserState, interactedElements?: (DOMHistoryElement | null)[]) {
    this.url = state.url;
    this.title = state.title;
    this.tabs = state.tabs;
    this.interactedElements = interactedElements ?? [];
    // this.screenshot = state.screenshot;
  }
}

export class BrowserError extends Error {
  /**
   * Base class for all browser errors
   */
  constructor(message?: string) {
    super(message);
    this.name = 'BrowserError';
  }
}

export class URLNotAllowedError extends BrowserError {
  /**
   * Error raised when a URL is not allowed
   */
  constructor(message?: string) {
    super(message);
    this.name = 'URLNotAllowedError';
  }
}
