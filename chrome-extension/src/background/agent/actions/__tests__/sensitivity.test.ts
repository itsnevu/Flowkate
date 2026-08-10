import { describe, it, expect } from 'vitest';
import { DOMElementNode, DOMTextNode } from '../../../browser/dom/views';
import { classifySensitiveAction, SensitiveActionKind } from '../sensitivity';

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
