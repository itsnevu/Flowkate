import { AgentNameEnum, llmProviderModelNames, ProviderTypeEnum } from './types';
import type { ProviderConfig } from './llmProviders';
import type { ModelConfig } from './agentModels';

/**
 * The models a saved provider actually offers, in the order that provider ships them.
 *
 * Mirrors how the options page builds its picker: an Azure provider exposes the user's
 * deployment names, everyone else a model list that falls back to the built-in catalogue.
 */
export function providerModelCatalogue(providerId: string, config: ProviderConfig): string[] {
  if (config.type === ProviderTypeEnum.AzureOpenAI) {
    return [...(config.azureDeploymentNames ?? [])];
  }
  return [...(config.modelNames ?? llmProviderModelNames[providerId as keyof typeof llmProviderModelNames] ?? [])];
}

/**
 * A provider's small, cheap tier, by the name every provider happens to give it.
 *
 * The separator guard is what keeps this from firing on "gemini", which contains "mini" —
 * a false positive there would point the Planner at a flash model on every Gemini install.
 */
const CHEAP_TIER = /(?:^|[-_/:. ])(mini|flash|haiku|lite|small|fast)(?:$|[-_/:. ])/i;

/**
 * Which model each agent should start on, given a provider's catalogue.
 *
 * Providers list their flagship first, so that is what the Planner and the Navigator get. The
 * Fast agent is optional by design — it falls back to the Navigator's model when unset — so it
 * is only filled in when the catalogue actually names a cheap tier, never by demoting the
 * flagship to stand in for one.
 */
export function pickDefaultAgentModels(
  providerId: string,
  models: string[],
): Partial<Record<AgentNameEnum, ModelConfig>> {
  const [flagship] = models;
  if (!flagship) return {};

  const picks: Partial<Record<AgentNameEnum, ModelConfig>> = {
    [AgentNameEnum.Planner]: { provider: providerId, modelName: flagship },
    [AgentNameEnum.Navigator]: { provider: providerId, modelName: flagship },
  };

  const cheap = models.find(model => model !== flagship && CHEAP_TIER.test(model));
  if (cheap) {
    picks[AgentNameEnum.Fast] = { provider: providerId, modelName: cheap };
  }

  return picks;
}
