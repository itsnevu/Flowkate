import { describe, it, expect } from 'vitest';
import { parseFollowUp, FOLLOW_UP_MAX_CHARS, FOLLOW_UP_MAX_CHAIN } from '../webhookContract';

/**
 * A webhook response that can queue tasks is a command channel, so what it may and may not say is
 * a contract worth pinning: exactly one string field, bounded, everything else ignored.
 */
describe('parseFollowUp', () => {
  it('reads a follow-up task with an optional title', () => {
    expect(parseFollowUp({ followUp: 'check the price again' })).toEqual({ task: 'check the price again' });
    expect(parseFollowUp({ followUp: 'check again', title: 'Recheck' })).toEqual({
      task: 'check again',
      title: 'Recheck',
    });
  });

  it('trims and rejects empty or whitespace-only tasks', () => {
    expect(parseFollowUp({ followUp: '  spaced  ' })).toEqual({ task: 'spaced' });
    expect(parseFollowUp({ followUp: '   ' })).toBeNull();
    expect(parseFollowUp({ followUp: '' })).toBeNull();
  });

  it('rejects everything that is not a string task', () => {
    expect(parseFollowUp(null)).toBeNull();
    expect(parseFollowUp(undefined)).toBeNull();
    expect(parseFollowUp('just a string body')).toBeNull();
    expect(parseFollowUp({})).toBeNull();
    expect(parseFollowUp({ followUp: 42 })).toBeNull();
    expect(parseFollowUp({ followUp: { task: 'nested' } })).toBeNull();
    expect(parseFollowUp({ followup: 'wrong case' })).toBeNull();
  });

  it('rejects a task longer than the cap instead of truncating a command', () => {
    expect(parseFollowUp({ followUp: 'a'.repeat(FOLLOW_UP_MAX_CHARS) })).not.toBeNull();
    expect(parseFollowUp({ followUp: 'a'.repeat(FOLLOW_UP_MAX_CHARS + 1) })).toBeNull();
  });

  it('drops a non-string or empty title rather than failing the follow-up', () => {
    expect(parseFollowUp({ followUp: 'go', title: 7 })).toEqual({ task: 'go' });
    expect(parseFollowUp({ followUp: 'go', title: '  ' })).toEqual({ task: 'go' });
  });

  it('caps the title length', () => {
    const parsed = parseFollowUp({ followUp: 'go', title: 'x'.repeat(300) });
    expect(parsed?.title).toHaveLength(80);
  });

  it('keeps the chain cap small enough that a hostile receiver terminates quickly', () => {
    expect(FOLLOW_UP_MAX_CHAIN).toBeLessThanOrEqual(5);
  });
});
