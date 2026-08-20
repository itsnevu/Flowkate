import { describe, it, expect } from 'vitest';
import { DOMElementNode, DEFAULT_INCLUDE_ATTRIBUTES } from '../views';

/**
 * What the model is told about a control, and what it therefore believes it can do.
 *
 * The listing built here is the only description of the page a non-vision run ever sees. An
 * attribute missing from it is a fact the model cannot act on: it clicks a greyed-out Continue over
 * and over because nothing said the button was dead, and after a rejected submit it cannot read
 * which field the page is objecting to.
 */

/** One interactive element under a root, rendered the way a state message renders it. */
function render(tagName: string, attributes: Record<string, string>, includeAttributes = DEFAULT_INCLUDE_ATTRIBUTES) {
  const root = new DOMElementNode({
    tagName: 'body',
    xpath: '',
    attributes: {},
    children: [],
    isVisible: true,
    parent: null,
  });
  const element = new DOMElementNode({
    tagName,
    xpath: `/body/${tagName}`,
    attributes,
    children: [],
    isVisible: true,
    isInteractive: true,
    isTopElement: true,
    isInViewport: true,
    highlightIndex: 0,
    parent: root,
  });
  root.children.push(element);
  return root.clickableElementsToString(includeAttributes);
}

describe('element listing attributes', () => {
  /**
   * The bug this pins. A boolean attribute carries an empty string, and the filter dropped every
   * attribute whose value was empty - so `disabled` was invisible even once it was on the include
   * list, and `checked`, which had been on that list all along, never rendered once.
   */
  it.each(['disabled', 'required', 'readonly', 'checked', 'selected', 'multiple'])(
    'renders %s as a bare key when its presence is the whole message',
    attribute => {
      const line = render('button', { [attribute]: '' });

      expect(line).toContain(attribute);
      // `disabled=` reads like a value went missing rather than like a fact
      expect(line).not.toContain(`${attribute}=`);
    },
  );

  it('still drops an ordinary attribute that carries nothing', () => {
    expect(render('button', { title: '', 'aria-label': '' })).not.toContain('title');
  });

  it('keeps a presence attribute that does carry a value', () => {
    expect(render('input', { required: 'required' })).toContain('required=required');
  });

  it('surfaces the aria spellings, which carry real values', () => {
    const line = render('div', { role: 'button', 'aria-disabled': 'true', 'aria-invalid': 'true' });

    expect(line).toContain('aria-disabled=true');
    expect(line).toContain('aria-invalid=true');
  });

  it('carries the state a form rejection is described in', () => {
    for (const attribute of ['disabled', 'required', 'aria-required', 'aria-invalid', 'readonly', 'maxlength']) {
      expect(DEFAULT_INCLUDE_ATTRIBUTES).toContain(attribute);
    }
  });

  it('says nothing about a control that has nothing to say', () => {
    const line = render('button', {});

    expect(line).toContain('<button');
    expect(line).not.toContain('disabled');
    expect(line).not.toContain('required');
  });

  it('honours an include list that leaves the form attributes out', () => {
    expect(render('button', { disabled: '' }, ['title'])).not.toContain('disabled');
  });
});
