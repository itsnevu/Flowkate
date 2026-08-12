import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentNameEnum, ProviderTypeEnum } from '@extension/storage';
import {
  defaultReasoningEffortFor,
  getAgentDescription,
  getProviderTypeLabel,
  isAnthropicModel,
  isOpenAIReasoningModel,
  maxCustomProviderNumber,
  sortProviderEntries,
} from '../helpers';
import type { ProviderConfig } from '@extension/storage';

/** Shorthand for the sparse configs these helpers actually look at. */
const provider = (config: Partial<ProviderConfig> = {}): ProviderConfig => ({
  apiKey: '',
  type: ProviderTypeEnum.OpenAI,
  ...config,
});

describe('isOpenAIReasoningModel', () => {
  it('accepts the O-series', () => {
    expect(isOpenAIReasoningModel('o1')).toBe(true);
    expect(isOpenAIReasoningModel('o3-mini')).toBe(true);
    expect(isOpenAIReasoningModel('o4-mini')).toBe(true);
  });

  it('accepts gpt-5 and its variants', () => {
    expect(isOpenAIReasoningModel('gpt-5')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5.1')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5-mini')).toBe(true);
    expect(isOpenAIReasoningModel('gpt-5-pro')).toBe(true);
  });

  // gpt-5-chat is the non-reasoning sibling: offering it a reasoning_effort would be rejected
  // by the provider, so this exclusion is what keeps the temperature sliders on screen for it.
  it('rejects gpt-5-chat, which is not a reasoning model', () => {
    expect(isOpenAIReasoningModel('gpt-5-chat')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-5-chat-latest')).toBe(false);
  });

  it('rejects ordinary chat models', () => {
    expect(isOpenAIReasoningModel('gpt-4o')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4.1-mini')).toBe(false);
    expect(isOpenAIReasoningModel('claude-sonnet-4-5')).toBe(false);
    expect(isOpenAIReasoningModel('')).toBe(false);
  });

  // The selects store `provider>model`, so the raw stored value is what reaches this helper.
  it('looks past the `provider>model` prefix the selects store', () => {
    expect(isOpenAIReasoningModel('openai>o3')).toBe(true);
    expect(isOpenAIReasoningModel('openai>gpt-5')).toBe(true);
    expect(isOpenAIReasoningModel('openai>gpt-5-chat-latest')).toBe(false);
    expect(isOpenAIReasoningModel('openai>gpt-4o')).toBe(false);
  });

  // OpenRouter namespaces its catalogue, so the same model arrives as `openai/o3`.
  it('looks past an `openai/` vendor prefix', () => {
    expect(isOpenAIReasoningModel('openai/o3')).toBe(true);
    expect(isOpenAIReasoningModel('openai/gpt-5')).toBe(true);
    expect(isOpenAIReasoningModel('openai/gpt-5-chat-latest')).toBe(false);
    expect(isOpenAIReasoningModel('openai/gpt-4o')).toBe(false);
  });

  it('strips both prefixes together', () => {
    expect(isOpenAIReasoningModel('openrouter>openai/o1')).toBe(true);
    expect(isOpenAIReasoningModel('openrouter>openai/gpt-5-chat-latest')).toBe(false);
  });

  // Without the `openai/` strip these would ride on the bare `startsWith('o')` branch and every
  // model from those vendors would be mistaken for a reasoning model.
  it('does not mistake a non-OpenAI vendor prefix for the O-series', () => {
    expect(isOpenAIReasoningModel('openrouter>anthropic/claude-sonnet-4-5')).toBe(false);
    expect(isOpenAIReasoningModel('openrouter>google/gemini-2.5-pro')).toBe(false);
  });
});

describe('isAnthropicModel', () => {
  it('matches claude- models, with or without a provider prefix', () => {
    expect(isAnthropicModel('claude-sonnet-4-5')).toBe(true);
    expect(isAnthropicModel('anthropic>claude-opus-4-1')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAnthropicModel('gpt-4o')).toBe(false);
    expect(isAnthropicModel('openai>o3')).toBe(false);
    expect(isAnthropicModel('')).toBe(false);
  });

  // Anthropic rejects temperature and top-p together, so this drives whether top-p is offered.
  it('does not strip a vendor prefix, unlike the reasoning check', () => {
    expect(isAnthropicModel('openrouter>anthropic/claude-sonnet-4-5')).toBe(false);
  });
});

describe('getProviderTypeLabel', () => {
  it('labels custom providers as OpenAI-compatible rather than by id', () => {
    expect(getProviderTypeLabel(ProviderTypeEnum.CustomOpenAI)).toBe('OpenAI-compatible API Provider');
  });

  it('uses the storage display name for built-in providers', () => {
    expect(getProviderTypeLabel(ProviderTypeEnum.OpenAI)).toBe('OpenAI');
    expect(getProviderTypeLabel(ProviderTypeEnum.AzureOpenAI)).toBe('Azure OpenAI');
    expect(getProviderTypeLabel(ProviderTypeEnum.Anthropic)).toBe('Anthropic');
  });
});

describe('defaultReasoningEffortFor', () => {
  // The planner is the agent that actually reasons; the others run routine steps, so paying for
  // reasoning tokens there is waste.
  it('gives the planner a higher default than the other agents', () => {
    expect(defaultReasoningEffortFor(AgentNameEnum.Planner)).toBe('low');
    expect(defaultReasoningEffortFor(AgentNameEnum.Navigator)).toBe('minimal');
    expect(defaultReasoningEffortFor(AgentNameEnum.Fast)).toBe('minimal');
  });

  it('only ever returns a member of the ReasoningEffort union', () => {
    const allowed = ['minimal', 'low', 'medium', 'high'];
    for (const agentName of Object.values(AgentNameEnum)) {
      expect(allowed).toContain(defaultReasoningEffortFor(agentName));
    }
  });
});

describe('getAgentDescription', () => {
  it('describes every agent in the enum', () => {
    for (const agentName of Object.values(AgentNameEnum)) {
      expect(getAgentDescription(agentName)).not.toBe('');
    }
  });

  it('gives each agent its own description', () => {
    const descriptions = Object.values(AgentNameEnum).map(getAgentDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('returns an empty string for an unknown agent rather than throwing', () => {
    expect(getAgentDescription('auditor' as AgentNameEnum)).toBe('');
  });
});

describe('maxCustomProviderNumber', () => {
  it('returns 0 when nothing custom is configured', () => {
    expect(maxCustomProviderNumber([])).toBe(0);
    expect(maxCustomProviderNumber(['openai', 'anthropic'])).toBe(0);
  });

  // The caller adds 1 to pick the next id, so a gap must not let it collide with a live provider.
  it('takes the highest suffix, not the count or the last entry', () => {
    expect(maxCustomProviderNumber(['custom_openai_1', 'custom_openai_7', 'custom_openai_3'])).toBe(7);
  });

  it('handles multi-digit suffixes', () => {
    expect(maxCustomProviderNumber(['custom_openai_9', 'custom_openai_12'])).toBe(12);
  });

  it('ignores ids that merely mention the prefix', () => {
    expect(maxCustomProviderNumber(['my_custom_openai_9'])).toBe(0);
  });
});

describe('sortProviderEntries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops providers that are neither stored nor edited', () => {
    const entries = sortProviderEntries(
      { openai: provider(), ghost: provider() },
      new Set(['openai']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['openai']);
  });

  it('keeps an edited provider that storage has not seen yet', () => {
    const entries = sortProviderEntries(
      { custom_openai_1: provider() },
      new Set<string>(),
      new Set(['custom_openai_1']),
    );
    expect(entries.map(([id]) => id)).toEqual(['custom_openai_1']);
  });

  // A half-written config would crash the card that renders it; it is filtered rather than fixed.
  it('drops entries with no config or no type, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = sortProviderEntries(
      {
        openai: provider(),
        broken: { apiKey: '' } as ProviderConfig,
        missing: undefined as unknown as ProviderConfig,
      },
      new Set(['openai', 'broken', 'missing']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['openai']);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  // The point of the whole sort: a provider you just added lands under the ones already there,
  // instead of jumping to wherever its name sorts.
  it('pushes newly added providers below stored ones', () => {
    const entries = sortProviderEntries(
      {
        fresh: provider({ createdAt: 1 }),
        stored: provider({ createdAt: 2 }),
      },
      new Set(['stored']),
      new Set(['fresh']),
    );
    expect(entries.map(([id]) => id)).toEqual(['stored', 'fresh']);
  });

  it('orders by createdAt, oldest first', () => {
    const entries = sortProviderEntries(
      {
        third: provider({ createdAt: 300 }),
        first: provider({ createdAt: 100 }),
        second: provider({ createdAt: 200 }),
      },
      new Set(['first', 'second', 'third']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['first', 'second', 'third']);
  });

  it('puts a provider with a createdAt ahead of one without', () => {
    const entries = sortProviderEntries(
      { undated: provider(), dated: provider({ createdAt: 100 }) },
      new Set(['undated', 'dated']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['dated', 'undated']);
  });

  it('falls back to built-in before custom, then by name', () => {
    const entries = sortProviderEntries(
      {
        custom_openai_1: provider({ type: ProviderTypeEnum.CustomOpenAI, name: 'Alpha' }),
        gemini: provider({ type: ProviderTypeEnum.Gemini, name: 'Zeta' }),
        anthropic: provider({ type: ProviderTypeEnum.Anthropic, name: 'Beta' }),
      },
      new Set(['custom_openai_1', 'gemini', 'anthropic']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['anthropic', 'gemini', 'custom_openai_1']);
  });

  it('sorts unnamed providers by id', () => {
    const entries = sortProviderEntries(
      { zeta: provider(), alpha: provider() },
      new Set(['zeta', 'alpha']),
      new Set<string>(),
    );
    expect(entries.map(([id]) => id)).toEqual(['alpha', 'zeta']);
  });

  it('does not mutate the input record', () => {
    const providers = { b: provider({ createdAt: 2 }), a: provider({ createdAt: 1 }) };
    const before = Object.keys(providers);
    sortProviderEntries(providers, new Set(['a', 'b']), new Set<string>());
    expect(Object.keys(providers)).toEqual(before);
  });
});
