import { describe, it, expect } from 'vitest';
import {
  parseFollowUp,
  datasetForWebhook,
  FOLLOW_UP_MAX_CHARS,
  FOLLOW_UP_MAX_CHAIN,
  WEBHOOK_MAX_DATASET_CHARS,
} from '../webhookContract';

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

/**
 * The other direction of the contract: what a finished task is allowed to put on the wire. The
 * collector bounds a table for a file on disk; this bounds it for an HTTP body, which is a much
 * smaller thing, and it trims rather than refusing so a big scrape still arrives.
 */
describe('datasetForWebhook', () => {
  const table = (rows: string[][], truncated = false) => ({ fields: ['name', 'price'], rows, truncated });

  it('passes a small table through untouched', () => {
    const dataset = table([
      ['Kite', '10'],
      ['Line', '4'],
    ]);

    expect(datasetForWebhook(dataset)).toEqual(dataset);
  });

  it('sends nothing when there is nothing to send', () => {
    expect(datasetForWebhook(undefined)).toBeNull();
    expect(datasetForWebhook(table([]))).toBeNull();
    expect(datasetForWebhook({ fields: [], rows: [['orphan']], truncated: false })).toBeNull();
  });

  it("keeps the collector's own truncation flag, which is about rows it never stored", () => {
    expect(datasetForWebhook(table([['Kite', '10']], true))?.truncated).toBe(true);
  });

  it('trims to the budget and says the receiver is holding a prefix', () => {
    const wide = 'x'.repeat(500);
    const rows = Array.from({ length: 5000 }, () => [wide, wide]);

    const sent = datasetForWebhook(table(rows));

    expect(sent).not.toBeNull();
    expect(sent!.rows.length).toBeLessThan(rows.length);
    expect(sent!.truncated).toBe(true);
    expect(JSON.stringify(sent!.rows).length).toBeLessThanOrEqual(WEBHOOK_MAX_DATASET_CHARS);
  });

  it('sends the first row even when it alone blows the budget', () => {
    const enormous = [['x'.repeat(WEBHOOK_MAX_DATASET_CHARS + 10), 'y']];

    const sent = datasetForWebhook(table(enormous));

    expect(sent!.rows).toHaveLength(1);
    expect(sent!.truncated).toBe(false);
  });

  it('hands back the same rows, not copies of them - the body is built and thrown away', () => {
    const rows = [['Kite', '10']];

    expect(datasetForWebhook(table(rows))!.rows[0]).toBe(rows[0]);
  });
});
