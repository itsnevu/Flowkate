import { describe, it, expect } from 'vitest';
import { DOMElementNode, DOMTextNode } from '../../../browser/dom/views';
import {
  classifySensitiveAction,
  classifyManualAction,
  SensitiveActionKind,
  SILENT_ACTION_NAMES,
} from '../sensitivity';

/** Build a clickable element with the given visible text and attributes. */
function element(text: string, attributes: Record<string, string> = {}, tagName = 'button'): DOMElementNode {
  const node = new DOMElementNode({
    tagName,
    xpath: '/html/body/button',
    attributes,
    children: [],
    isVisible: true,
    isInteractive: true,
    highlightIndex: 1,
  });
  if (text) {
    node.children.push(new DOMTextNode(text, true, node));
  }
  return node;
}

describe('classifySensitiveAction', () => {
  describe('actions that must be confirmed', () => {
    it('flags a purchase from the button label', () => {
      const verdict = classifySensitiveAction('click_element', { index: 1 }, element('Place order'));
      expect(verdict?.kind).toBe(SensitiveActionKind.PURCHASE);
    });

    it('flags a destructive click', () => {
      const verdict = classifySensitiveAction('click_element', { index: 1 }, element('Delete account'));
      expect(verdict?.kind).toBe(SensitiveActionKind.DESTRUCTIVE);
    });

    it('flags a bare submit control even with no readable label', () => {
      const verdict = classifySensitiveAction('click_element', { index: 1 }, element('', { type: 'submit' }, 'input'));
      expect(verdict?.kind).toBe(SensitiveActionKind.FORM_SUBMIT);
    });

    it('flags Enter, since that submits most forms without touching a button', () => {
      const verdict = classifySensitiveAction('send_keys', { keys: 'Enter' }, undefined);
      expect(verdict?.kind).toBe(SensitiveActionKind.FORM_SUBMIT);
    });

    it('flags navigation that starts a download', () => {
      const verdict = classifySensitiveAction('go_to_url', { url: 'https://x.test/report.pdf?v=2' }, undefined);
      expect(verdict?.kind).toBe(SensitiveActionKind.DOWNLOAD);
    });

    it('flags typing into a password field', () => {
      const verdict = classifySensitiveAction('input_text', { index: 1 }, element('', { type: 'password' }, 'input'));
      expect(verdict?.kind).toBe(SensitiveActionKind.CREDENTIALS);
    });

    it('reads the label from aria-label when there is no text', () => {
      const verdict = classifySensitiveAction('click_element', { index: 1 }, element('', { 'aria-label': 'Buy now' }));
      expect(verdict?.kind).toBe(SensitiveActionKind.PURCHASE);
    });
  });

  describe('actions that must not interrupt the user', () => {
    it('ignores an ordinary link', () => {
      expect(classifySensitiveAction('click_element', { index: 1 }, element('Read more', {}, 'a'))).toBeNull();
    });

    it('ignores scrolling and reading', () => {
      expect(classifySensitiveAction('scroll_to_bottom', {}, undefined)).toBeNull();
      expect(classifySensitiveAction('cache_content', { content: 'x' }, undefined)).toBeNull();
    });

    it('ignores typing into a normal text field', () => {
      expect(classifySensitiveAction('input_text', { index: 1 }, element('', { type: 'text' }, 'input'))).toBeNull();
    });

    it('ignores navigation to a normal page', () => {
      expect(classifySensitiveAction('go_to_url', { url: 'https://x.test/docs' }, undefined)).toBeNull();
    });

    // substring matching would fire on "postcode" and "forbidden", training the user to click through
    it('matches keywords on word boundaries, not substrings', () => {
      expect(classifySensitiveAction('click_element', { index: 1 }, element('Postcode lookup', {}, 'a'))).toBeNull();
      expect(classifySensitiveAction('click_element', { index: 1 }, element('Forbidden words', {}, 'a'))).toBeNull();
    });

    it('ignores arrow keys', () => {
      expect(classifySensitiveAction('send_keys', { keys: 'ArrowDown' }, undefined)).toBeNull();
    });
  });
});

describe('classifyManualAction', () => {
  /**
   * Manual mode's gate set. This exists because the failure is silent in both directions: widening
   * SILENT_ACTION_NAMES un-gates an action nobody notices is no longer asked about, and narrowing it
   * buries the sensitive prompts under noise until the user clicks through everything by reflex.
   */
  it('gates navigation, which is where an agent ends up somewhere unexpected', () => {
    for (const action of ['go_to_url', 'search_google', 'go_back']) {
      expect(`${action}: ${classifyManualAction(action, undefined) !== null}`).toBe(`${action}: true`);
    }
  });

  it('gates the actions that change the page', () => {
    for (const action of ['click_element', 'input_text', 'send_keys', 'select_dropdown_option']) {
      expect(`${action}: ${classifyManualAction(action, undefined) !== null}`).toBe(`${action}: true`);
    }
  });

  it('stays silent for scrolling, reading and waiting', () => {
    for (const action of ['scroll_to_percent', 'scroll_to_top', 'scroll_to_text', 'cache_content', 'wait', 'done']) {
      expect(`${action}: ${classifyManualAction(action, undefined)}`).toBe(`${action}: null`);
    }
  });

  // the silent set must never quietly acquire a navigation action - see subtaskRunner's 'auto' pin,
  // which is load-bearing precisely because these three are NOT silent
  it('never lets a navigation action into the silent set', () => {
    for (const action of ['go_to_url', 'search_google', 'go_back']) {
      expect(`${action} silent: ${SILENT_ACTION_NAMES.has(action)}`).toBe(`${action} silent: false`);
    }
  });

  it('describes the target by its label when there is an element', () => {
    // labelOf normalises to lower case, so assert on that rather than on the source casing
    const verdict = classifyManualAction('click_element', element('Open settings', {}, 'a'));
    expect(verdict?.target).toContain('open settings');
  });

  it('falls back to the action name when there is no element', () => {
    expect(classifyManualAction('go_back', undefined)?.target).toBe('go_back');
  });
});
