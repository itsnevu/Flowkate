import { describe, it, expect } from 'vitest';
import { ChatAnthropic } from '@langchain/anthropic';
import { isSamplingRemovedClaudeModel } from '../helper';

/**
 * Sampling parameters were removed from the current Claude families and now return a 400 there,
 * while older models still accept them. Model names are free text in the options UI, so nothing
 * stops a user reaching either side of that line - and getting it wrong fails every request on the
 * first step, not gracefully at save time.
 */
describe('isSamplingRemovedClaudeModel', () => {
  it.each(['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5', 'claude-fable-5'])(
    'reports %s as rejecting sampling parameters',
    model => {
      expect(isSamplingRemovedClaudeModel(model)).toBe(true);
    },
  );

  it.each(['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'])(
    'reports %s as still accepting them',
    model => {
      expect(isSamplingRemovedClaudeModel(model)).toBe(false);
    },
  );

  it('assumes an unrecognised name accepts them', () => {
    // The older behaviour, which is what every model predating these families wants.
    expect(isSamplingRemovedClaudeModel('some-future-model')).toBe(false);
  });
});

describe('ChatAnthropic request body', () => {
  const samplingParams = (client: ChatAnthropic) => {
    const params = client.invocationParams() as Record<string, unknown>;
    // Round-trip through JSON, because that is what decides whether an `undefined` reaches the wire.
    return JSON.parse(
      JSON.stringify({ temperature: params.temperature, top_p: params.top_p, top_k: params.top_k }),
    ) as Record<string, unknown>;
  };

  it('carries none of them once suppressed', () => {
    // `temperature: null` alone is not enough: the client fills top_p and top_k from its own
    // defaults for any model outside a hardcoded 4.1/4.5 list, so they go out as -1.
    const client = new ChatAnthropic({
      model: 'claude-opus-5',
      apiKey: 'test',
      temperature: null,
      invocationKwargs: { temperature: undefined, top_p: undefined, top_k: undefined },
    });
    expect(samplingParams(client)).toEqual({});
  });

  it('would otherwise send all three, which is the 400', () => {
    const client = new ChatAnthropic({ model: 'claude-opus-5', apiKey: 'test', temperature: 0.1 });
    expect(samplingParams(client)).toEqual({ temperature: 0.1, top_p: -1, top_k: -1 });
  });

  it('still carries temperature for a model that accepts it', () => {
    const client = new ChatAnthropic({ model: 'claude-sonnet-4-5', apiKey: 'test', temperature: 0.1 });
    expect(samplingParams(client).temperature).toBe(0.1);
  });
});
