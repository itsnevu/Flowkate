import { AgentNameEnum, ProviderTypeEnum, getDefaultDisplayNameFromProviderId } from '@extension/storage';
import { t } from '@extension/i18n';
import type { ProviderConfig } from '@extension/storage';
import type { ReasoningEffort } from './types';

// Helper function to check if a model is an OpenAI reasoning model (O-series or GPT-5 models)
export function isOpenAIReasoningModel(modelName: string): boolean {
  // Extract the model name without provider prefix if present
  let modelNameWithoutProvider = modelName;
  if (modelName.includes('>')) {
    // Handle "provider>model" format
    modelNameWithoutProvider = modelName.split('>')[1];
  }
  if (modelNameWithoutProvider.startsWith('openai/')) {
    modelNameWithoutProvider = modelNameWithoutProvider.substring(7);
  }
  return (
    modelNameWithoutProvider.startsWith('o') ||
    (modelNameWithoutProvider.startsWith('gpt-5') && !modelNameWithoutProvider.startsWith('gpt-5-chat'))
  );
}

export function isAnthropicModel(modelName: string): boolean {
  // Extract the model name without provider prefix if present
  let modelNameWithoutProvider = modelName;

  if (modelName.includes('>')) {
    // Handle "provider>model" format
    modelNameWithoutProvider = modelName.split('>')[1];
  }

  // Check if the model starts with 'claude-'
  return modelNameWithoutProvider.startsWith('claude-');
}

// Label shown in the small graphite pill next to each provider name
export function getProviderTypeLabel(providerType: ProviderTypeEnum): string {
  return providerType === ProviderTypeEnum.CustomOpenAI
    ? t('options_models_providers_openaiCompatible')
    : getDefaultDisplayNameFromProviderId(providerType);
}

/** Reasoning models default to a cheap effort, except the planner, which is the one that thinks. */
export function defaultReasoningEffortFor(agentName: AgentNameEnum): ReasoningEffort {
  return agentName === AgentNameEnum.Planner ? 'low' : 'minimal';
}

export function getAgentDescription(agentName: AgentNameEnum): string {
  switch (agentName) {
    case AgentNameEnum.Navigator:
      return t('options_models_agents_navigator');
    case AgentNameEnum.Planner:
      return t('options_models_agents_planner');
    case AgentNameEnum.Fast:
      return t('options_models_agents_fast');
    default:
      return '';
  }
}

/** Highest `custom_openai_N` suffix in use, so the next custom provider can take N + 1. */
export function maxCustomProviderNumber(providerIds: string[]): number {
  let maxNumber = 0;
  for (const providerId of providerIds) {
    if (providerId.startsWith('custom_openai_')) {
      const match = providerId.match(/custom_openai_(\d+)/);
      if (match) {
        const number = Number.parseInt(match[1], 10);
        maxNumber = Math.max(maxNumber, number);
      }
    }
  }
  return maxNumber;
}

// Sort providers to ensure newly added providers appear at the bottom
export function sortProviderEntries(
  providers: Record<string, ProviderConfig>,
  providersFromStorage: Set<string>,
  modifiedProviders: Set<string>,
): Array<[string, ProviderConfig]> {
  // Filter providers to only include those from storage and newly added providers
  const filteredProviders = Object.entries(providers).filter(([providerId, config]) => {
    // ALSO filter out any provider missing a config or type, to satisfy TS
    if (!config || !config.type) {
      console.warn(`Filtering out provider ${providerId} with missing config or type.`);
      return false;
    }

    // Include if it's from storage
    if (providersFromStorage.has(providerId)) {
      return true;
    }

    // Include if it's a newly added provider (has been modified)
    if (modifiedProviders.has(providerId)) {
      return true;
    }

    // Exclude providers that aren't from storage and haven't been modified
    return false;
  });

  // Sort the filtered providers
  return filteredProviders.sort(([keyA, configA], [keyB, configB]) => {
    // Separate newly added providers from stored providers
    const isNewA = !providersFromStorage.has(keyA) && modifiedProviders.has(keyA);
    const isNewB = !providersFromStorage.has(keyB) && modifiedProviders.has(keyB);

    // If one is new and one is stored, new ones go to the end
    if (isNewA && !isNewB) return 1;
    if (!isNewA && isNewB) return -1;

    // If both are new or both are stored, sort by createdAt
    if (configA.createdAt && configB.createdAt) {
      return configA.createdAt - configB.createdAt; // Sort in ascending order (oldest first)
    }

    // If only one has createdAt, put the one without createdAt at the end
    if (configA.createdAt) return -1;
    if (configB.createdAt) return 1;

    // If neither has createdAt, sort by type and then name
    const isCustomA = configA.type === ProviderTypeEnum.CustomOpenAI;
    const isCustomB = configB.type === ProviderTypeEnum.CustomOpenAI;

    if (isCustomA && !isCustomB) {
      return 1; // Custom providers come after non-custom
    }

    if (!isCustomA && isCustomB) {
      return -1; // Non-custom providers come before custom
    }

    // Sort alphabetically by name within each group
    return (configA.name || keyA).localeCompare(configB.name || keyB);
  });
}
