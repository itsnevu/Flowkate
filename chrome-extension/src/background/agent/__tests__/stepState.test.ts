import { describe, it, expect, beforeEach } from 'vitest';
import { DOMElementNode } from '../../browser/dom/views';
import { AgentContext } from '../types';
import type BrowserContext from '../../browser/context';
import type Page from '../../browser/page';
import type { BrowserState } from '../../browser/views';
import type { EventManager } from '../event/manager';
import type MessageManager from '../messages/service';

const PAGE_URL = 'https://x.test/checkout';

function node(highlightIndex: number): DOMElementNode {
  return new DOMElementNode({
    tagName: 'button',
    xpath: `/html/body/button[${highlightIndex}]`,
    attributes: {},
    children: [],
    isVisible: true,
    isInteractive: true,
    highlightIndex,
  });
}

/** The page the action is about to run against. Only tabId and url() are consulted. */
function pageStub(overrides: { tabId?: number; url?: string } = {}): Page {
  return {
    tabId: overrides.tabId ?? 1,
    url: () => overrides.url ?? PAGE_URL,
  } as unknown as Page;
}

/** The parse the model reasoned over, as recorded when the state message was built. */
function stepState(elements: DOMElementNode[], overrides: { tabId?: number; url?: string } = {}): BrowserState {
  const selectorMap = new Map(elements.map(element => [element.highlightIndex as number, element]));
  return {
    tabId: overrides.tabId ?? 1,
    url: overrides.url ?? PAGE_URL,
    title: 'Checkout',
    screenshot: null,
    scrollY: 0,
    scrollHeight: 0,
    visualViewportHeight: 0,
    tabs: [],
    elementTree: elements[0],
    selectorMap,
  } as unknown as BrowserState;
}

describe('AgentContext.resolveStepElement', () => {
  let context: AgentContext;
  let target: DOMElementNode;

  beforeEach(() => {
    context = new AgentContext('t', {} as BrowserContext, {} as MessageManager, {} as EventManager, {});
    target = node(7);
    context.stepState = stepState([node(1), target]);
  });

  it('returns the very node the model was shown, not a lookalike', () => {
    expect(context.resolveStepElement(7, pageStub())).toBe(target);
  });

  // Between the state message and the action the page can navigate under us. The indices would then
  // still resolve, but to elements from a page the model never saw.
  it('refuses once the page has navigated', () => {
    expect(context.resolveStepElement(7, pageStub({ url: 'https://x.test/confirmation' }))).toBeNull();
  });

  it('refuses once the user has switched tabs', () => {
    expect(context.resolveStepElement(7, pageStub({ tabId: 2 }))).toBeNull();
  });

  it('refuses between steps, when no state has been recorded', () => {
    context.stepState = null;
    expect(context.resolveStepElement(7, pageStub())).toBeNull();
  });

  it('refuses an index the model invented', () => {
    expect(context.resolveStepElement(99, pageStub())).toBeNull();
  });

  it('matches the url exactly, including the fragment the state was captured with', () => {
    context.stepState = stepState([target], { url: `${PAGE_URL}#step2` });
    expect(context.resolveStepElement(7, pageStub())).toBeNull();
    expect(context.resolveStepElement(7, pageStub({ url: `${PAGE_URL}#step2` }))).toBe(target);
  });
});
