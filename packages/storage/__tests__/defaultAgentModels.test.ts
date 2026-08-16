import { describe, it, expect } from 'vitest';
import { pickDefaultAgentModels, providerModelCatalogue } from '../lib/settings/defaultAgentModels';
import { AgentNameEnum, ProviderTypeEnum, llmProviderModelNames } from '../lib/settings/types';
import type { ProviderConfig } from '../lib/settings/llmProviders';

/**
 * These picks are what a fresh install runs on: the side panel is gated on an agent having a
 * model, so whatever is chosen here is the model a first task actually uses. Two properties
 * matter — the Planner never lands on a cheap tier by accident, and Fast stays unset rather
 * than being filled with a stand-in, because unset means "reuse the Navigator's model".
 */
describe('pickDefaultAgentModels', () => {
  it('puts the flagship on both agents and the cheap tier on Fast', () => {
    const picks = pickDefaultAgentModels('openai', llmProviderModelNames[ProviderTypeEnum.OpenAI]);

    expect(picks[AgentNameEnum.Planner]).toEqual({ provider: 'openai', modelName: 'gpt-5.1' });
    expect(picks[AgentNameEnum.Navigator]).toEqual({ provider: 'openai', modelName: 'gpt-5.1' });
    expect(picks[AgentNameEnum.Fast]).toEqual({ provider: 'openai', modelName: 'gpt-5-mini' });
  });

  it('does not read "mini" out of the middle of "gemini"', () => {
    const picks = pickDefaultAgentModels('gemini', llmProviderModelNames[ProviderTypeEnum.Gemini]);

    // The flagship is first and stays first; flash is the cheap tier, gemini-3-pro is not.
    expect(picks[AgentNameEnum.Planner]?.modelName).toBe('gemini-3-pro-preview');
    expect(picks[AgentNameEnum.Fast]?.modelName).toBe('gemini-2.5-flash');
  });

  it.each([
    [ProviderTypeEnum.Anthropic, 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    [ProviderTypeEnum.Grok, 'grok-4', 'grok-4-fast-non-reasoning'],
    [ProviderTypeEnum.OpenRouter, 'google/gemini-2.5-pro', 'google/gemini-2.5-flash'],
  ])('picks flagship and cheap tier for %s', (provider, flagship, cheap) => {
    const picks = pickDefaultAgentModels(provider, llmProviderModelNames[provider]);

    expect(picks[AgentNameEnum.Planner]?.modelName).toBe(flagship);
    expect(picks[AgentNameEnum.Fast]?.modelName).toBe(cheap);
  });

  it('leaves Fast unset when the catalogue names no cheap tier', () => {
    const picks = pickDefaultAgentModels('deepseek', llmProviderModelNames[ProviderTypeEnum.DeepSeek]);

    expect(picks[AgentNameEnum.Planner]?.modelName).toBe('deepseek-chat');
    expect(picks[AgentNameEnum.Navigator]?.modelName).toBe('deepseek-chat');
    expect(picks[AgentNameEnum.Fast]).toBeUndefined();
  });

  it('never points Fast at the same model as the Navigator', () => {
    const picks = pickDefaultAgentModels('custom', ['my-mini-model', 'something-else']);

    expect(picks[AgentNameEnum.Navigator]?.modelName).toBe('my-mini-model');
    expect(picks[AgentNameEnum.Fast]).toBeUndefined();
  });

  it('picks nothing at all from an empty catalogue', () => {
    expect(pickDefaultAgentModels('custom_openai', [])).toEqual({});
  });
});

describe('providerModelCatalogue', () => {
  it('reads Azure deployments rather than model names', () => {
    const config = {
      name: 'Azure',
      type: ProviderTypeEnum.AzureOpenAI,
      apiKey: 'k',
      azureDeploymentNames: ['prod-gpt-5', 'prod-gpt-5-mini'],
    } as ProviderConfig;

    expect(providerModelCatalogue('azure_openai', config)).toEqual(['prod-gpt-5', 'prod-gpt-5-mini']);
  });

  it('falls back to the built-in catalogue when a provider stored no model list', () => {
    const config = { name: 'OpenAI', type: ProviderTypeEnum.OpenAI, apiKey: 'k' } as ProviderConfig;

    expect(providerModelCatalogue('openai', config)).toEqual(llmProviderModelNames[ProviderTypeEnum.OpenAI]);
  });

  it('is empty for a custom provider with nothing configured, so nothing is seeded', () => {
    const config = { name: 'Mine', type: ProviderTypeEnum.CustomOpenAI, apiKey: 'k' } as ProviderConfig;

    expect(providerModelCatalogue('custom_openai', config)).toEqual([]);
  });
});
