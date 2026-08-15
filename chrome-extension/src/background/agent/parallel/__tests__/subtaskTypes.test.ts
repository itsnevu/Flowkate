import { describe, it, expect } from 'vitest';
import { summarizeSubtaskResults, type SubtaskResult } from '../subtaskTypes';
import { READ_ONLY_ACTION_NAMES } from '../../actions/readOnlyActions';

describe('summarizeSubtaskResults', () => {
  const results: SubtaskResult[] = [
    { task: 'price at shop A', url: 'https://a.test', findings: '19.99 EUR', succeeded: true },
    { task: 'price at shop B', url: 'https://b.test', findings: 'page timed out', succeeded: false },
  ];

  it('keeps each subtask attributable to its own question and source', () => {
    const summary = summarizeSubtaskResults(results);
    expect(summary).toContain('price at shop A');
    expect(summary).toContain('https://a.test');
    expect(summary).toContain('19.99 EUR');
  });

  // a failure that reads like a finding would be merged into the answer as though it were data
  it('marks failures distinctly from findings', () => {
    const summary = summarizeSubtaskResults(results);
    expect(summary).toContain('[OK]');
    expect(summary).toContain('[FAILED]');
  });

  it('returns an empty summary when nothing ran', () => {
    expect(summarizeSubtaskResults([])).toBe('');
  });
});

describe('read-only action allowlist', () => {
  // subtasks run in background tabs the user cannot reach, so anything that changes state on a site
  // must be impossible there by construction rather than by the model choosing well
  // ask_user is excluded for its own reason: a background tab has no user standing by, so a
  // handoff raised from one would park the subtask forever.
  it.each(['click_element', 'input_text', 'send_keys', 'select_dropdown_option', 'remember', 'ask_user'])(
    'excludes %s',
    actionName => {
      expect(READ_ONLY_ACTION_NAMES.has(actionName)).toBe(false);
    },
  );

  it.each(['go_to_url', 'search_google', 'cache_content', 'scroll_to_bottom', 'done', 'extract_content'])(
    'allows %s',
    actionName => {
      expect(READ_ONLY_ACTION_NAMES.has(actionName)).toBe(true);
    },
  );
});
