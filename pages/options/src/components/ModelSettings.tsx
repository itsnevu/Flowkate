/*
 * Changes:
 * - Added a searchable select component with filtering capability for model selection
 * - Implemented keyboard navigation and accessibility for the custom dropdown
 * - Added search functionality that filters models based on user input
 * - Added keyboard event handlers to close dropdowns with Escape key
 * - Restyled onto the "soft machine" design system: pale canvas ground, raised
 *   provider cards, sunken wells for every input and graphite keys for actions
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  llmProviderStore,
  agentModelStore,
  speechToTextModelStore,
  AgentNameEnum,
  llmProviderModelNames,
  ProviderTypeEnum,
  getDefaultDisplayNameFromProviderId,
  getDefaultProviderConfig,
  getDefaultAgentModelParams,
  type ProviderConfig,
} from '@extension/storage';
import { t } from '@extension/i18n';
import type { KeyboardEvent } from 'react';

// --- Design system recipes -------------------------------------------------
// Shared class strings so every field in this long pane is extruded from the
// same material. Light always falls from the top-left.

const LABEL_BASE = 'text-xs font-medium uppercase tracking-wide text-ink-soft';
const FIELD_LABEL = `mb-1.5 block ${LABEL_BASE}`;
const FIELD_WELL =
  'w-full rounded-soft bg-canvas-sunk px-3 py-2 text-sm text-ink shadow-neu-inset-sm placeholder:text-ink-faint transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset';
const SELECT_WELL = `${FIELD_WELL} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none`;
const TAG_WELL = 'flex min-h-[42px] flex-wrap items-center gap-2 rounded-soft bg-canvas-sunk p-2 shadow-neu-inset';
const TAG_INPUT =
  'min-w-[150px] flex-1 rounded-soft bg-transparent p-1 text-sm text-ink placeholder:text-ink-faint transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset-sm';
const KEY_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-soft bg-graphite px-4 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:bg-graphite disabled:active:translate-y-0';
const KEY_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-soft bg-canvas-raised px-4 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none';
const ICON_KEY =
  'grid size-9 shrink-0 place-items-center rounded-soft bg-canvas-raised text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm';
const CHIP =
  'flex items-center gap-1 rounded-pill bg-graphite py-1 pl-3 pr-1 text-xs font-medium text-graphite-50 shadow-key-sm';
const CHIP_REMOVE =
  'grid size-5 place-items-center rounded-pill text-graphite-200 transition-colors duration-150 ease-press hover:bg-white/10 hover:text-graphite-50';
const DIVIDER = 'h-px bg-gradient-to-r from-transparent via-black/10 to-transparent';

// Chevron for the sunken selects — the native arrow is hidden by appearance-none.
const SelectChevron = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
    aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// Slider track: graphite fill up to the current value, sunken canvas after it.
const sliderTrack = (fraction: number) => {
  const percent = Math.min(Math.max(fraction, 0), 1) * 100;
  return {
    background: `linear-gradient(to right, #1c1f24 0%, #1c1f24 ${percent}%, #e6e9ee ${percent}%, #e6e9ee 100%)`,
  };
};

// Helper function to check if a model is an OpenAI reasoning model (O-series or GPT-5 models)
function isOpenAIReasoningModel(modelName: string): boolean {
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

function isAnthropicModel(modelName: string): boolean {
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
function getProviderTypeLabel(providerType: ProviderTypeEnum): string {
  return providerType === ProviderTypeEnum.CustomOpenAI
    ? t('options_models_providers_openaiCompatible')
    : getDefaultDisplayNameFromProviderId(providerType);
}

export const ModelSettings = () => {
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [modifiedProviders, setModifiedProviders] = useState<Set<string>>(new Set());
  const [providersFromStorage, setProvidersFromStorage] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Record<AgentNameEnum, string>>({
    [AgentNameEnum.Navigator]: '',
    [AgentNameEnum.Planner]: '',
    [AgentNameEnum.Fast]: '',
  });
  const [modelParameters, setModelParameters] = useState<Record<AgentNameEnum, { temperature: number; topP: number }>>({
    [AgentNameEnum.Navigator]: { temperature: 0, topP: 0 },
    [AgentNameEnum.Planner]: { temperature: 0, topP: 0 },
    [AgentNameEnum.Fast]: { temperature: 0, topP: 0 },
  });

  // State for reasoning effort for O-series models
  const [reasoningEffort, setReasoningEffort] = useState<
    Record<AgentNameEnum, 'minimal' | 'low' | 'medium' | 'high' | undefined>
  >({
    [AgentNameEnum.Navigator]: undefined,
    [AgentNameEnum.Planner]: undefined,
    [AgentNameEnum.Fast]: undefined,
  });
  const [newModelInputs, setNewModelInputs] = useState<Record<string, string>>({});
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false);
  const newlyAddedProviderRef = useRef<string | null>(null);
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  // Add state for tracking API key visibility
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});
  // Create a non-async wrapper for use in render functions
  const [availableModels, setAvailableModels] = useState<
    Array<{ provider: string; providerName: string; model: string }>
  >([]);
  // State for model input handling

  const [selectedSpeechToTextModel, setSelectedSpeechToTextModel] = useState<string>('');

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const allProviders = await llmProviderStore.getAllProviders();
        // Never log allProviders: every entry carries an apiKey in plain text.

        // Track which providers are from storage
        const fromStorage = new Set(Object.keys(allProviders));
        setProvidersFromStorage(fromStorage);

        // Only use providers from storage, don't add default ones
        setProviders(allProviders);
      } catch (error) {
        console.error('Error loading providers:', error);
        // Set empty providers on error
        setProviders({});
        // No providers from storage on error
        setProvidersFromStorage(new Set());
      }
    };

    loadProviders();
  }, []);

  // Load existing agent models and parameters on mount
  useEffect(() => {
    const loadAgentModels = async () => {
      try {
        const models: Record<AgentNameEnum, string> = {
          [AgentNameEnum.Planner]: '',
          [AgentNameEnum.Navigator]: '',
          [AgentNameEnum.Fast]: '',
        };

        for (const agent of Object.values(AgentNameEnum)) {
          const config = await agentModelStore.getAgentModel(agent);
          if (config) {
            // Store in provider>model format
            models[agent] = `${config.provider}>${config.modelName}`;
            if (config.parameters?.temperature !== undefined || config.parameters?.topP !== undefined) {
              setModelParameters(prev => ({
                ...prev,
                [agent]: {
                  temperature: config.parameters?.temperature ?? prev[agent].temperature,
                  topP: config.parameters?.topP ?? prev[agent].topP,
                },
              }));
            }
            // Also load reasoningEffort if available
            if (config.reasoningEffort) {
              setReasoningEffort(prev => ({
                ...prev,
                [agent]: config.reasoningEffort as 'minimal' | 'low' | 'medium' | 'high',
              }));
            }
          }
        }
        setSelectedModels(models);
      } catch (error) {
        console.error('Error loading agent models:', error);
      }
    };

    loadAgentModels();
  }, []);

  useEffect(() => {
    const loadSpeechToTextModel = async () => {
      try {
        const config = await speechToTextModelStore.getSpeechToTextModel();
        if (config) {
          setSelectedSpeechToTextModel(`${config.provider}>${config.modelName}`);
        }
      } catch (error) {
        console.error('Error loading speech-to-text model:', error);
      }
    };

    loadSpeechToTextModel();
  }, []);

  // Auto-focus the input field when a new provider is added
  useEffect(() => {
    // Only focus if we have a newly added provider reference
    if (newlyAddedProviderRef.current && providers[newlyAddedProviderRef.current]) {
      const providerId = newlyAddedProviderRef.current;
      const config = providers[providerId];

      // For custom providers, focus on the name input
      if (config.type === ProviderTypeEnum.CustomOpenAI) {
        const nameInput = document.getElementById(`${providerId}-name`);
        if (nameInput) {
          nameInput.focus();
        }
      } else {
        // For default providers, focus on the API key input
        const apiKeyInput = document.getElementById(`${providerId}-api-key`);
        if (apiKeyInput) {
          apiKeyInput.focus();
        }
      }

      // Clear the ref after focusing
      newlyAddedProviderRef.current = null;
    }
  }, [providers]);

  // Add a click outside handler to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isProviderSelectorOpen && !target.closest('.provider-selector-container')) {
        setIsProviderSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProviderSelectorOpen]);

  // Create a memoized version of getAvailableModels
  const getAvailableModelsCallback = useCallback(async () => {
    const models: Array<{ provider: string; providerName: string; model: string }> = [];

    try {
      // Load providers directly from storage
      const storedProviders = await llmProviderStore.getAllProviders();

      // Only use providers that are actually in storage
      for (const [provider, config] of Object.entries(storedProviders)) {
        if (config.type === ProviderTypeEnum.AzureOpenAI) {
          // Handle Azure providers specially - use deployment names as models
          const deploymentNames = config.azureDeploymentNames || [];

          models.push(
            ...deploymentNames.map(deployment => ({
              provider,
              providerName: config.name || provider,
              model: deployment,
            })),
          );
        } else {
          // Standard handling for non-Azure providers
          const providerModels =
            config.modelNames || llmProviderModelNames[provider as keyof typeof llmProviderModelNames] || [];
          models.push(
            ...providerModels.map(model => ({
              provider,
              providerName: config.name || provider,
              model,
            })),
          );
        }
      }
    } catch (error) {
      console.error('Error loading providers for model selection:', error);
    }

    return models;
  }, []);

  // Update available models whenever providers change
  useEffect(() => {
    const updateAvailableModels = async () => {
      const models = await getAvailableModelsCallback();
      setAvailableModels(models);
    };

    updateAvailableModels();
  }, [getAvailableModelsCallback]); // Only depends on the callback

  const handleApiKeyChange = (provider: string, apiKey: string, baseUrl?: string) => {
    setModifiedProviders(prev => new Set(prev).add(provider));
    setProviders(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        apiKey: apiKey.trim(),
        baseUrl: baseUrl !== undefined ? baseUrl.trim() : prev[provider]?.baseUrl,
      },
    }));
  };

  // Add a toggle handler for API key visibility
  const toggleApiKeyVisibility = (provider: string) => {
    setVisibleApiKeys(prev => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  const handleNameChange = (provider: string, name: string) => {
    setModifiedProviders(prev => new Set(prev).add(provider));
    setProviders(prev => {
      const updated = {
        ...prev,
        [provider]: {
          ...prev[provider],
          name: name.trim(),
        },
      };
      return updated;
    });
  };

  const handleModelsChange = (provider: string, modelsString: string) => {
    setNewModelInputs(prev => ({
      ...prev,
      [provider]: modelsString,
    }));
  };

  const addModel = (provider: string, model: string) => {
    if (!model.trim()) return;

    setModifiedProviders(prev => new Set(prev).add(provider));
    setProviders(prev => {
      const providerData = prev[provider] || {};

      // Get current models - either from provider config or default models
      let currentModels = providerData.modelNames;
      if (currentModels === undefined) {
        currentModels = [...(llmProviderModelNames[provider as keyof typeof llmProviderModelNames] || [])];
      }

      // Don't add duplicates
      if (currentModels.includes(model.trim())) return prev;

      return {
        ...prev,
        [provider]: {
          ...providerData,
          modelNames: [...currentModels, model.trim()],
        },
      };
    });

    // Clear the input
    setNewModelInputs(prev => ({
      ...prev,
      [provider]: '',
    }));
  };

  const removeModel = (provider: string, modelToRemove: string) => {
    setModifiedProviders(prev => new Set(prev).add(provider));

    setProviders(prev => {
      const providerData = prev[provider] || {};

      // If modelNames doesn't exist in the provider data yet, we need to initialize it
      // with the default models from llmProviderModelNames first
      if (!providerData.modelNames) {
        const defaultModels = llmProviderModelNames[provider as keyof typeof llmProviderModelNames] || [];
        const filteredModels = defaultModels.filter(model => model !== modelToRemove);

        return {
          ...prev,
          [provider]: {
            ...providerData,
            modelNames: filteredModels,
          },
        };
      }

      // If modelNames already exists, just filter out the model to remove
      return {
        ...prev,
        [provider]: {
          ...providerData,
          modelNames: providerData.modelNames.filter(model => model !== modelToRemove),
        },
      };
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, provider: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const value = newModelInputs[provider] || '';
      addModel(provider, value);
    }
  };

  const getButtonProps = (provider: string) => {
    const isInStorage = providersFromStorage.has(provider);
    const isModified = modifiedProviders.has(provider);

    // For deletion, we only care if it's in storage and not modified
    if (isInStorage && !isModified) {
      return {
        variant: 'danger' as const,
        children: t('options_models_providers_btnDelete'),
        disabled: false,
      };
    }

    // For saving, we need to check if it has the required inputs
    let hasInput = false;
    const providerType = providers[provider]?.type;
    const config = providers[provider];

    if (providerType === ProviderTypeEnum.CustomOpenAI) {
      hasInput = Boolean(config?.baseUrl?.trim()); // Custom needs Base URL, name checked elsewhere
    } else if (providerType === ProviderTypeEnum.Ollama) {
      hasInput = Boolean(config?.baseUrl?.trim()); // Ollama needs Base URL
    } else if (providerType === ProviderTypeEnum.AzureOpenAI) {
      // Azure needs API Key, Endpoint, Deployment Names, and API Version
      hasInput =
        Boolean(config?.apiKey?.trim()) &&
        Boolean(config?.baseUrl?.trim()) &&
        Boolean(config?.azureDeploymentNames?.length) &&
        Boolean(config?.azureApiVersion?.trim());
    } else if (providerType === ProviderTypeEnum.OpenRouter) {
      // OpenRouter needs API Key and optionally Base URL (has default)
      hasInput = Boolean(config?.apiKey?.trim()) && Boolean(config?.baseUrl?.trim());
    } else if (providerType === ProviderTypeEnum.Llama) {
      // Llama needs API Key and Base URL
      hasInput = Boolean(config?.apiKey?.trim()) && Boolean(config?.baseUrl?.trim());
    } else {
      // Other built-in providers just need API Key
      hasInput = Boolean(config?.apiKey?.trim());
    }

    return {
      variant: 'primary' as const,
      children: t('options_models_providers_btnSave'),
      disabled: !hasInput || !isModified,
    };
  };

  const handleSave = async (provider: string) => {
    try {
      // Check if name contains spaces for custom providers
      if (providers[provider].type === ProviderTypeEnum.CustomOpenAI && providers[provider].name?.includes(' ')) {
        setNameErrors(prev => ({
          ...prev,
          [provider]: t('options_models_providers_errors_spacesNotAllowed'),
        }));
        return;
      }

      // Check if base URL is required but missing for custom_openai, ollama, azure_openai or openrouter
      // Note: Groq and Cerebras do not require base URL as they use the default endpoint
      if (
        (providers[provider].type === ProviderTypeEnum.CustomOpenAI ||
          providers[provider].type === ProviderTypeEnum.Ollama ||
          providers[provider].type === ProviderTypeEnum.AzureOpenAI ||
          providers[provider].type === ProviderTypeEnum.OpenRouter ||
          providers[provider].type === ProviderTypeEnum.Llama) &&
        (!providers[provider].baseUrl || !providers[provider].baseUrl.trim())
      ) {
        alert(t('options_models_providers_errors_baseUrlRequired', getDefaultDisplayNameFromProviderId(provider)));
        return;
      }

      // Ensure modelNames is provided
      let modelNames = providers[provider].modelNames;
      if (!modelNames) {
        // Use default model names if not explicitly set
        modelNames = [...(llmProviderModelNames[provider as keyof typeof llmProviderModelNames] || [])];
      }

      // Prepare data for saving using the correctly typed config from state
      // We can directly pass the relevant parts of the state config
      // Create a copy to avoid modifying state directly if needed, though setProvider likely handles it
      const configToSave: Partial<ProviderConfig> = { ...providers[provider] }; // Use Partial to allow deleting modelNames

      // Explicitly set required fields that might be missing in partial state updates (though unlikely now)
      configToSave.apiKey = providers[provider].apiKey || '';
      configToSave.name = providers[provider].name || getDefaultDisplayNameFromProviderId(provider);
      configToSave.type = providers[provider].type;
      configToSave.createdAt = providers[provider].createdAt || Date.now();
      // baseUrl, azureDeploymentName, azureApiVersion should be correctly set by handlers

      if (providers[provider].type === ProviderTypeEnum.AzureOpenAI) {
        // Ensure modelNames is NOT included for Azure
        configToSave.modelNames = undefined;
      } else {
        // Ensure modelNames IS included for non-Azure
        // Use existing modelNames from state, or default if somehow missing
        configToSave.modelNames =
          providers[provider].modelNames || llmProviderModelNames[provider as keyof typeof llmProviderModelNames] || [];
      }

      // Pass the cleaned config to setProvider
      // Cast to ProviderConfig as we've ensured necessary fields based on type
      await llmProviderStore.setProvider(provider, configToSave as ProviderConfig);

      // Clear any name errors on successful save
      setNameErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[provider];
        return newErrors;
      });

      // Add to providersFromStorage since it's now saved
      setProvidersFromStorage(prev => new Set(prev).add(provider));

      setModifiedProviders(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });

      // Refresh available models
      const models = await getAvailableModelsCallback();
      setAvailableModels(models);
    } catch (error) {
      console.error('Error saving API key:', error);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      // Delete the provider from storage regardless of its API key value
      await llmProviderStore.removeProvider(provider);

      // Remove from providersFromStorage
      setProvidersFromStorage(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });

      // Remove from providers state
      setProviders(prev => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });

      // Also remove from modifiedProviders if it's there
      setModifiedProviders(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });

      // Refresh available models
      const models = await getAvailableModelsCallback();
      setAvailableModels(models);
    } catch (error) {
      console.error('Error deleting provider:', error);
    }
  };

  const handleCancelProvider = (providerId: string) => {
    // Remove the provider from the state
    setProviders(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    // Remove from modified providers
    setModifiedProviders(prev => {
      const next = new Set(prev);
      next.delete(providerId);
      return next;
    });
  };

  const handleModelChange = async (agentName: AgentNameEnum, modelValue: string) => {
    // modelValue will be in format "provider>model"
    const [provider, model] = modelValue.split('>');

    // Set parameters based on provider type
    const newParameters = getDefaultAgentModelParams(provider, agentName);

    setModelParameters(prev => ({
      ...prev,
      [agentName]: newParameters,
    }));

    // Store both provider and model name in the format "provider>model"
    setSelectedModels(prev => ({
      ...prev,
      [agentName]: modelValue, // Store the full provider>model value
    }));

    try {
      if (model) {
        // Reset reasoning effort if switching models
        if (isOpenAIReasoningModel(modelValue)) {
          // Set default reasoning effort based on agent type
          const defaultReasoningEffort = agentName === AgentNameEnum.Planner ? 'low' : 'minimal';
          setReasoningEffort(prev => ({
            ...prev,
            [agentName]: prev[agentName] || defaultReasoningEffort,
          }));
        } else {
          // Clear reasoning effort for non-O-series models
          setReasoningEffort(prev => ({
            ...prev,
            [agentName]: undefined,
          }));
        }

        // For Anthropic Opus models, only pass temperature, not topP
        const parametersToSave = isAnthropicModel(modelValue)
          ? { temperature: newParameters.temperature }
          : newParameters;

        await agentModelStore.setAgentModel(agentName, {
          provider,
          modelName: model,
          parameters: parametersToSave,
          reasoningEffort: isOpenAIReasoningModel(modelValue)
            ? reasoningEffort[agentName] || (agentName === AgentNameEnum.Planner ? 'low' : 'minimal')
            : undefined,
        });
      } else {
        // Reset storage if no model is selected
        await agentModelStore.resetAgentModel(agentName);
      }
    } catch (error) {
      console.error('Error saving agent model:', error);
    }
  };

  const handleReasoningEffortChange = async (
    agentName: AgentNameEnum,
    value: 'minimal' | 'low' | 'medium' | 'high',
  ) => {
    setReasoningEffort(prev => ({
      ...prev,
      [agentName]: value,
    }));

    // Only update if we have a selected model
    if (selectedModels[agentName] && isOpenAIReasoningModel(selectedModels[agentName])) {
      try {
        // Extract provider and model from the "provider>model" format
        const [provider, modelName] = selectedModels[agentName].split('>');

        if (provider && modelName) {
          await agentModelStore.setAgentModel(agentName, {
            provider,
            modelName,
            parameters: modelParameters[agentName],
            reasoningEffort: value,
          });
        }
      } catch (error) {
        console.error('Error saving reasoning effort:', error);
      }
    }
  };

  const handleParameterChange = async (agentName: AgentNameEnum, paramName: 'temperature' | 'topP', value: number) => {
    const newParameters = {
      ...modelParameters[agentName],
      [paramName]: value,
    };

    setModelParameters(prev => ({
      ...prev,
      [agentName]: newParameters,
    }));

    // Only update if we have a selected model
    if (selectedModels[agentName]) {
      try {
        // Extract provider and model from the "provider>model" format
        const [provider, modelName] = selectedModels[agentName].split('>');

        if (provider && modelName) {
          // For Anthropic Opus models, only pass temperature, not topP
          const parametersToSave = isAnthropicModel(selectedModels[agentName])
            ? { temperature: newParameters.temperature }
            : newParameters;

          await agentModelStore.setAgentModel(agentName, {
            provider,
            modelName,
            parameters: parametersToSave,
          });
        }
      } catch (error) {
        console.error('Error saving agent parameters:', error);
      }
    }
  };

  const handleSpeechToTextModelChange = async (modelValue: string) => {
    setSelectedSpeechToTextModel(modelValue);

    try {
      if (modelValue) {
        // Parse the "provider>model" format
        const [provider, modelName] = modelValue.split('>');

        // Save to proper storage
        await speechToTextModelStore.setSpeechToTextModel({
          provider,
          modelName,
        });
      } else {
        // Reset if no model selected
        await speechToTextModelStore.resetSpeechToTextModel();
      }
    } catch (error) {
      console.error('Error saving speech-to-text model:', error);
    }
  };

  const renderModelSelect = (agentName: AgentNameEnum) => (
    <div className="rounded-slab bg-canvas-raised p-5 shadow-neu">
      <h3 className="text-base font-semibold text-ink">{agentName.charAt(0).toUpperCase() + agentName.slice(1)}</h3>
      <p className="mt-1 text-xs text-ink-faint">{getAgentDescription(agentName)}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Model Selection */}
        <div className="sm:col-span-2">
          <label htmlFor={`${agentName}-model`} className={FIELD_LABEL}>
            {t('options_models_labels_model')}
          </label>
          <div className="relative">
            <select
              id={`${agentName}-model`}
              className={SELECT_WELL}
              disabled={availableModels.length === 0}
              value={selectedModels[agentName] || ''} // Use the stored provider>model value directly
              onChange={e => handleModelChange(agentName, e.target.value)}>
              <option key="default" value="">
                {t('options_models_chooseModel')}
              </option>
              {availableModels.map(({ provider, providerName, model }) => (
                <option key={`${provider}>${model}`} value={`${provider}>${model}`}>
                  {`${providerName} > ${model}`}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
        </div>

        {/* Temperature Slider - Only show for non-reasoning models */}
        {selectedModels[agentName] && !isOpenAIReasoningModel(selectedModels[agentName]) && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor={`${agentName}-temperature`} className={LABEL_BASE}>
                {t('options_models_labels_temperature')}
              </label>
              <span className="font-mono text-xs text-ink-soft">
                {modelParameters[agentName].temperature.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id={`${agentName}-temperature`}
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={modelParameters[agentName].temperature}
                onChange={e => handleParameterChange(agentName, 'temperature', Number.parseFloat(e.target.value))}
                style={sliderTrack(modelParameters[agentName].temperature / 2)}
                className="h-1.5 flex-1 appearance-none rounded-pill shadow-neu-inset-sm accent-graphite-800"
              />
              <input
                type="number"
                min="0"
                max="2"
                step="0.01"
                value={modelParameters[agentName].temperature}
                onChange={e => {
                  const value = Number.parseFloat(e.target.value);
                  if (!Number.isNaN(value) && value >= 0 && value <= 2) {
                    handleParameterChange(agentName, 'temperature', value);
                  }
                }}
                className="w-20 rounded-soft bg-canvas-sunk px-2 py-1 text-sm text-ink shadow-neu-inset-sm transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset"
                aria-label={`${agentName} temperature number input`}
              />
            </div>
          </div>
        )}

        {/* Top P Slider - Only show for non-reasoning models */}
        {selectedModels[agentName] &&
          !isOpenAIReasoningModel(selectedModels[agentName]) &&
          !isAnthropicModel(selectedModels[agentName]) && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor={`${agentName}-topP`} className={LABEL_BASE}>
                  {t('options_models_labels_topP')}
                </label>
                <span className="font-mono text-xs text-ink-soft">{modelParameters[agentName].topP.toFixed(3)}</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id={`${agentName}-topP`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={modelParameters[agentName].topP}
                  onChange={e => handleParameterChange(agentName, 'topP', Number.parseFloat(e.target.value))}
                  style={sliderTrack(modelParameters[agentName].topP)}
                  className="h-1.5 flex-1 appearance-none rounded-pill shadow-neu-inset-sm accent-graphite-800"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.001"
                  value={modelParameters[agentName].topP}
                  onChange={e => {
                    const value = Number.parseFloat(e.target.value);
                    if (!Number.isNaN(value) && value >= 0 && value <= 1) {
                      handleParameterChange(agentName, 'topP', value);
                    }
                  }}
                  className="w-20 rounded-soft bg-canvas-sunk px-2 py-1 text-sm text-ink shadow-neu-inset-sm transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset"
                  aria-label={`${agentName} top P number input`}
                />
              </div>
            </div>
          )}

        {/* Reasoning Effort Selector (only for O-series models) */}
        {selectedModels[agentName] && isOpenAIReasoningModel(selectedModels[agentName]) && (
          <div>
            <label htmlFor={`${agentName}-reasoning-effort`} className={FIELD_LABEL}>
              {t('options_models_labels_reasoning')}
            </label>
            <div className="relative">
              <select
                id={`${agentName}-reasoning-effort`}
                value={reasoningEffort[agentName] || (agentName === AgentNameEnum.Planner ? 'low' : 'minimal')}
                onChange={e =>
                  handleReasoningEffortChange(agentName, e.target.value as 'minimal' | 'low' | 'medium' | 'high')
                }
                className={SELECT_WELL}>
                <option value="minimal/none">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <SelectChevron />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const getAgentDescription = (agentName: AgentNameEnum) => {
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
  };

  const getMaxCustomProviderNumber = () => {
    let maxNumber = 0;
    for (const providerId of Object.keys(providers)) {
      if (providerId.startsWith('custom_openai_')) {
        const match = providerId.match(/custom_openai_(\d+)/);
        if (match) {
          const number = Number.parseInt(match[1], 10);
          maxNumber = Math.max(maxNumber, number);
        }
      }
    }
    return maxNumber;
  };

  const addCustomProvider = () => {
    const nextNumber = getMaxCustomProviderNumber() + 1;
    const providerId = `custom_openai_${nextNumber}`;

    setProviders(prev => ({
      ...prev,
      [providerId]: {
        apiKey: '',
        name: `CustomProvider${nextNumber}`,
        type: ProviderTypeEnum.CustomOpenAI,
        baseUrl: '',
        modelNames: [],
        createdAt: Date.now(),
      },
    }));

    setModifiedProviders(prev => new Set(prev).add(providerId));

    // Set the newly added provider ref
    newlyAddedProviderRef.current = providerId;

    // Scroll to the newly added provider after render
    setTimeout(() => {
      const providerElement = document.getElementById(`provider-${providerId}`);
      if (providerElement) {
        providerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const addBuiltInProvider = (provider: string) => {
    // Get the default provider configuration
    const config = getDefaultProviderConfig(provider);

    // Add the provider to the state
    setProviders(prev => ({
      ...prev,
      [provider]: config,
    }));

    // Mark as modified so it shows up in the UI
    setModifiedProviders(prev => new Set(prev).add(provider));

    // Set the newly added provider ref
    newlyAddedProviderRef.current = provider;

    // Scroll to the newly added provider after render
    setTimeout(() => {
      const providerElement = document.getElementById(`provider-${provider}`);
      if (providerElement) {
        providerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Sort providers to ensure newly added providers appear at the bottom
  const getSortedProviders = () => {
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
  };

  const handleProviderSelection = (providerType: string) => {
    // Close the dropdown immediately
    setIsProviderSelectorOpen(false);

    // Handle custom provider
    if (providerType === ProviderTypeEnum.CustomOpenAI) {
      addCustomProvider();
      return;
    }

    // Handle Azure OpenAI specially to allow multiple instances
    if (providerType === ProviderTypeEnum.AzureOpenAI) {
      addAzureProvider();
      return;
    }

    // Handle built-in supported providers
    addBuiltInProvider(providerType);
  };

  // New function to add Azure providers with unique IDs
  const addAzureProvider = () => {
    // Count existing Azure providers
    const azureProviders = Object.keys(providers).filter(
      key => key === ProviderTypeEnum.AzureOpenAI || key.startsWith(`${ProviderTypeEnum.AzureOpenAI}_`),
    );
    const nextNumber = azureProviders.length + 1;

    // Create unique ID
    const providerId =
      nextNumber === 1 ? ProviderTypeEnum.AzureOpenAI : `${ProviderTypeEnum.AzureOpenAI}_${nextNumber}`;

    // Create config with appropriate name
    const config = getDefaultProviderConfig(ProviderTypeEnum.AzureOpenAI);
    config.name = `Azure OpenAI ${nextNumber}`;

    // Add to providers
    setProviders(prev => ({
      ...prev,
      [providerId]: config,
    }));

    setModifiedProviders(prev => new Set(prev).add(providerId));
    newlyAddedProviderRef.current = providerId;

    // Scroll to the newly added provider after render
    setTimeout(() => {
      const providerElement = document.getElementById(`provider-${providerId}`);
      if (providerElement) {
        providerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Add and remove Azure deployments
  const addAzureDeployment = (provider: string, deploymentName: string) => {
    if (!deploymentName.trim()) return;

    setModifiedProviders(prev => new Set(prev).add(provider));
    setProviders(prev => {
      const providerData = prev[provider] || {};

      // Initialize or use existing deploymentNames array
      const deploymentNames = providerData.azureDeploymentNames || [];

      // Don't add duplicates
      if (deploymentNames.includes(deploymentName.trim())) return prev;

      return {
        ...prev,
        [provider]: {
          ...providerData,
          azureDeploymentNames: [...deploymentNames, deploymentName.trim()],
        },
      };
    });

    // Clear the input
    setNewModelInputs(prev => ({
      ...prev,
      [provider]: '',
    }));
  };

  const removeAzureDeployment = (provider: string, deploymentToRemove: string) => {
    setModifiedProviders(prev => new Set(prev).add(provider));

    setProviders(prev => {
      const providerData = prev[provider] || {};

      // Get current deployments
      const deploymentNames = providerData.azureDeploymentNames || [];

      // Filter out the deployment to remove
      const filteredDeployments = deploymentNames.filter(name => name !== deploymentToRemove);

      return {
        ...prev,
        [provider]: {
          ...providerData,
          azureDeploymentNames: filteredDeployments,
        },
      };
    });
  };

  const handleAzureApiVersionChange = (provider: string, apiVersion: string) => {
    setModifiedProviders(prev => new Set(prev).add(provider));
    setProviders(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        azureApiVersion: apiVersion.trim(),
      },
    }));
  };

  return (
    <section className="space-y-8 text-left">
      {/* LLM Providers Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">{t('options_models_providers_header')}</h2>
        <div className="space-y-4">
          {getSortedProviders().length === 0 ? (
            <div className="rounded-soft bg-canvas-sunk px-6 py-10 text-center shadow-neu-inset">
              <p className="text-sm text-ink-soft">{t('options_models_providers_notConfigured')}</p>
            </div>
          ) : (
            getSortedProviders().map(([providerId, providerConfig]) => {
              // Add type guard to satisfy TypeScript
              if (!providerConfig || !providerConfig.type) {
                console.warn(`Skipping rendering for providerId ${providerId} due to missing config or type`);
                return null; // Skip rendering this item if config/type is somehow missing
              }

              const isNewProvider = modifiedProviders.has(providerId) && !providersFromStorage.has(providerId);
              const buttonProps = getButtonProps(providerId);

              return (
                <div
                  key={providerId}
                  id={`provider-${providerId}`}
                  className={`rounded-slab bg-canvas-raised p-5 shadow-neu ${isNewProvider ? 'animate-rise' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-ink">{providerConfig.name || providerId}</h3>
                      <span className="mt-1.5 inline-flex rounded-pill bg-graphite px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-graphite-50 shadow-key-sm">
                        {getProviderTypeLabel(providerConfig.type)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Show Cancel button for newly added providers */}
                      {isNewProvider && (
                        <button
                          type="button"
                          className={KEY_SECONDARY}
                          onClick={() => handleCancelProvider(providerId)}>
                          {t('options_models_providers_btnCancel')}
                        </button>
                      )}
                      <button
                        type="button"
                        className={buttonProps.variant === 'danger' ? `${KEY_SECONDARY} text-signal-bad` : KEY_PRIMARY}
                        disabled={buttonProps.disabled}
                        onClick={() =>
                          providersFromStorage.has(providerId) && !modifiedProviders.has(providerId)
                            ? handleDelete(providerId)
                            : handleSave(providerId)
                        }>
                        {buttonProps.children}
                      </button>
                    </div>
                  </div>

                  {/* Show message for newly added providers */}
                  {isNewProvider && (
                    <p className="mt-4 rounded-soft bg-canvas-sunk px-3 py-2 text-xs text-ink-soft shadow-neu-inset">
                      {t('options_models_providers_setupInstructions')}
                    </p>
                  )}

                  <div className="mt-5 space-y-4">
                    {/* Name input (only for custom_openai) - moved to top for prominence */}
                    {providerConfig.type === ProviderTypeEnum.CustomOpenAI && (
                      <div>
                        <label htmlFor={`${providerId}-name`} className={FIELD_LABEL}>
                          {t('options_models_providers_custom_name')}
                        </label>
                        <input
                          id={`${providerId}-name`}
                          type="text"
                          placeholder={t('options_models_providers_custom_name_placeholder')}
                          value={providerConfig.name || ''}
                          onChange={e => handleNameChange(providerId, e.target.value)}
                          className={FIELD_WELL}
                        />
                        {nameErrors[providerId] ? (
                          <p className="mt-1.5 text-xs text-signal-bad">{nameErrors[providerId]}</p>
                        ) : (
                          <p className="mt-1.5 text-xs text-ink-faint">
                            {t('options_models_providers_custom_name_desc')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* API Key input with label */}
                    <div>
                      <label htmlFor={`${providerId}-api-key`} className={FIELD_LABEL}>
                        {t('options_models_providers_apiKey')}
                        {/* Show asterisk only if required */}
                        {providerConfig.type !== ProviderTypeEnum.CustomOpenAI &&
                        providerConfig.type !== ProviderTypeEnum.Ollama
                          ? '*'
                          : ''}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`${providerId}-api-key`}
                          type="password"
                          placeholder={
                            providerConfig.type === ProviderTypeEnum.CustomOpenAI
                              ? t('options_models_providers_apiKey_placeholder_optional')
                              : providerConfig.type === ProviderTypeEnum.Ollama
                                ? t('options_models_providers_apiKey_placeholder_ollama')
                                : t('options_models_providers_apiKey_placeholder_required')
                          }
                          value={providerConfig.apiKey || ''}
                          onChange={e => handleApiKeyChange(providerId, e.target.value, providerConfig.baseUrl)}
                          className={`${FIELD_WELL} font-mono`}
                        />
                        {/* Show eye button only for newly added providers */}
                        {isNewProvider && (
                          <button
                            type="button"
                            className={ICON_KEY}
                            onClick={() => toggleApiKeyVisibility(providerId)}
                            aria-label={
                              visibleApiKeys[providerId]
                                ? t('options_models_providers_apiKey_hide')
                                : t('options_models_providers_apiKey_show')
                            }>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden="true">
                              <title>
                                {visibleApiKeys[providerId]
                                  ? t('options_models_providers_apiKey_hide')
                                  : t('options_models_providers_apiKey_show')}
                              </title>
                              {visibleApiKeys[providerId] ? (
                                <>
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                  <line x1="2" y1="22" x2="22" y2="2" />
                                </>
                              ) : (
                                <>
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </>
                              )}
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Display API key for newly added providers only when visible */}
                      {isNewProvider && visibleApiKeys[providerId] && providerConfig.apiKey && (
                        <p className="mt-2 break-words rounded-soft bg-canvas-sunk px-3 py-2 font-mono text-xs text-ink shadow-neu-inset">
                          {providerConfig.apiKey}
                        </p>
                      )}
                    </div>

                    {/* Base URL input (for custom_openai, ollama, azure_openai, openrouter, and llama) */}
                    {(providerConfig.type === ProviderTypeEnum.CustomOpenAI ||
                      providerConfig.type === ProviderTypeEnum.Ollama ||
                      providerConfig.type === ProviderTypeEnum.AzureOpenAI ||
                      providerConfig.type === ProviderTypeEnum.OpenRouter ||
                      providerConfig.type === ProviderTypeEnum.Llama) && (
                      <div>
                        <label htmlFor={`${providerId}-base-url`} className={FIELD_LABEL}>
                          {/* Adjust Label based on provider */}
                          {providerConfig.type === ProviderTypeEnum.AzureOpenAI
                            ? t('options_models_providers_endpoint')
                            : t('options_models_providers_baseUrl')}
                          {/* Show asterisk only if required */}
                          {/* OpenRouter has a default, so not strictly required, but needed for save button */}
                          {providerConfig.type === ProviderTypeEnum.CustomOpenAI ||
                          providerConfig.type === ProviderTypeEnum.AzureOpenAI
                            ? '*'
                            : ''}
                        </label>
                        <input
                          id={`${providerId}-base-url`}
                          type="text"
                          placeholder={
                            providerConfig.type === ProviderTypeEnum.CustomOpenAI
                              ? t('options_models_providers_placeholders_baseUrl_custom')
                              : providerConfig.type === ProviderTypeEnum.AzureOpenAI
                                ? t('options_models_providers_placeholders_baseUrl_azure')
                                : providerConfig.type === ProviderTypeEnum.OpenRouter
                                  ? t('options_models_providers_placeholders_baseUrl_openrouter')
                                  : providerConfig.type === ProviderTypeEnum.Llama
                                    ? t('options_models_providers_placeholders_baseUrl_llama')
                                    : t('options_models_providers_placeholders_baseUrl_ollama')
                          }
                          value={providerConfig.baseUrl || ''}
                          onChange={e => handleApiKeyChange(providerId, providerConfig.apiKey || '', e.target.value)}
                          className={FIELD_WELL}
                        />
                      </div>
                    )}

                    {/* Azure Deployment Name input as tags/chips like OpenRouter models */}
                    {(providerConfig.type as ProviderTypeEnum) === ProviderTypeEnum.AzureOpenAI && (
                      <div>
                        <label htmlFor={`${providerId}-azure-deployment`} className={FIELD_LABEL}>
                          {t('options_models_providers_deployment')}*
                        </label>
                        <div className={TAG_WELL}>
                          {/* Show azure deployments */}
                          {(providerConfig.azureDeploymentNames || []).length > 0
                            ? (providerConfig.azureDeploymentNames || []).map((deploymentName: string) => (
                                <span key={deploymentName} className={CHIP}>
                                  {deploymentName}
                                  <button
                                    type="button"
                                    onClick={() => removeAzureDeployment(providerId, deploymentName)}
                                    className={CHIP_REMOVE}
                                    aria-label={`Remove ${deploymentName}`}>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="size-3"
                                      aria-hidden="true">
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </span>
                              ))
                            : null}
                          <input
                            id={`${providerId}-azure-deployment-input`}
                            type="text"
                            placeholder={t('options_models_providers_placeholders_azureDeployment')}
                            value={newModelInputs[providerId] || ''}
                            onChange={e => handleModelsChange(providerId, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                const value = newModelInputs[providerId] || '';
                                if (value.trim()) {
                                  addAzureDeployment(providerId, value.trim());
                                  // Clear the input
                                  setNewModelInputs(prev => ({
                                    ...prev,
                                    [providerId]: '',
                                  }));
                                }
                              }
                            }}
                            className={TAG_INPUT}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-ink-faint">{t('options_models_providers_deployment_desc')}</p>
                      </div>
                    )}

                    {/* NEW: Azure API Version input */}
                    {(providerConfig.type as ProviderTypeEnum) === ProviderTypeEnum.AzureOpenAI && (
                      <div>
                        <label htmlFor={`${providerId}-azure-version`} className={FIELD_LABEL}>
                          {t('options_models_providers_apiVersion')}*
                        </label>
                        <input
                          id={`${providerId}-azure-version`}
                          type="text"
                          placeholder={t('options_models_providers_placeholders_azureApiVersion')}
                          value={providerConfig.azureApiVersion || ''}
                          onChange={e => handleAzureApiVersionChange(providerId, e.target.value)}
                          className={FIELD_WELL}
                        />
                      </div>
                    )}

                    {/* Models input section (for non-Azure providers) */}
                    {(providerConfig.type as ProviderTypeEnum) !== ProviderTypeEnum.AzureOpenAI && (
                      <div>
                        <label htmlFor={`${providerId}-models-label`} className={FIELD_LABEL}>
                          {t('options_models_providers_models')}
                        </label>
                        {/* Conditional UI for OpenRouter */}
                        {(providerConfig.type as ProviderTypeEnum) === ProviderTypeEnum.OpenRouter ? (
                          <>
                            <div className={TAG_WELL}>
                              {providerConfig.modelNames && providerConfig.modelNames.length > 0 ? (
                                providerConfig.modelNames.map(model => (
                                  <span key={model} className={CHIP}>
                                    {model}
                                    <button
                                      type="button"
                                      onClick={() => removeModel(providerId, model)}
                                      className={CHIP_REMOVE}
                                      aria-label={`Remove ${model}`}>
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="size-3"
                                        aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="px-1 text-xs text-ink-faint">
                                  {t('options_models_providers_models_openrouter_empty')}
                                </span>
                              )}
                              <input
                                id={`${providerId}-models-input`}
                                type="text"
                                placeholder=""
                                value={newModelInputs[providerId] || ''}
                                onChange={e => handleModelsChange(providerId, e.target.value)}
                                onKeyDown={e => handleKeyDown(e, providerId)}
                                className={TAG_INPUT}
                              />
                            </div>
                            <p className="mt-1.5 text-xs text-ink-faint">
                              {t('options_models_providers_models_instructions')}
                            </p>
                          </>
                        ) : (
                          /* Default Tag Input for other providers */
                          <>
                            <div className={TAG_WELL}>
                              {(() => {
                                const models =
                                  providerConfig.modelNames !== undefined
                                    ? providerConfig.modelNames
                                    : llmProviderModelNames[providerId as keyof typeof llmProviderModelNames] || [];
                                return models.map(model => (
                                  <span key={model} className={CHIP}>
                                    {model}
                                    <button
                                      type="button"
                                      onClick={() => removeModel(providerId, model)}
                                      className={CHIP_REMOVE}
                                      aria-label={`Remove ${model}`}>
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="size-3"
                                        aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </span>
                                ));
                              })()}
                              <input
                                id={`${providerId}-models-input`}
                                type="text"
                                placeholder=""
                                value={newModelInputs[providerId] || ''}
                                onChange={e => handleModelsChange(providerId, e.target.value)}
                                onKeyDown={e => handleKeyDown(e, providerId)}
                                className={TAG_INPUT}
                              />
                            </div>
                            <p className="mt-1.5 text-xs text-ink-faint">
                              {t('options_models_providers_models_instructions')}
                            </p>
                          </>
                        )}
                        {/* === END: Conditional UI === */}
                      </div>
                    )}

                    {/* Ollama reminder at the bottom of the section */}
                    {providerConfig.type === ProviderTypeEnum.Ollama && (
                      <div className="rounded-soft bg-canvas-sunk p-3 shadow-neu-inset">
                        <p className="text-xs leading-relaxed text-ink-soft">
                          <code className="rounded bg-graphite px-1.5 py-0.5 font-mono text-[11px] text-graphite-50 shadow-key-sm">
                            OLLAMA_ORIGINS=chrome-extension://*
                          </code>{' '}
                          {t('options_models_providers_ollama_reminder')}
                          <a
                            href="https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 font-medium text-ink underline decoration-ink-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink">
                            {t('options_models_providers_ollama_learnMore')}
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Add Provider button and dropdown */}
          <div className="provider-selector-container relative">
            <button
              type="button"
              onClick={() => setIsProviderSelectorOpen(prev => !prev)}
              className={`${KEY_PRIMARY} w-full`}>
              <span className="text-base leading-none">+</span>
              <span>{t('options_models_addNewProvider')}</span>
            </button>

            {isProviderSelectorOpen && (
              <div className="animate-rise absolute z-10 mt-2 w-full overflow-hidden rounded-slab bg-canvas-raised p-1.5 shadow-neu-lg">
                {/* Map through provider types to create buttons */}
                {Object.values(ProviderTypeEnum)
                  // Allow Azure to appear multiple times, but filter out other already added providers
                  .filter(
                    type =>
                      type === ProviderTypeEnum.AzureOpenAI || // Always show Azure
                      (type !== ProviderTypeEnum.CustomOpenAI &&
                        !providersFromStorage.has(type) &&
                        !modifiedProviders.has(type)),
                  )
                  .map(type => (
                    <button
                      key={type}
                      type="button"
                      className="flex w-full items-center rounded-soft px-3 py-2.5 text-left text-sm font-medium text-ink transition-all duration-150 ease-press hover:bg-canvas-sunk hover:shadow-neu-inset-sm"
                      onClick={() => handleProviderSelection(type)}>
                      {getDefaultDisplayNameFromProviderId(type)}
                    </button>
                  ))}

                {/* Custom provider button (always shown) */}
                <button
                  type="button"
                  className="flex w-full items-center rounded-soft px-3 py-2.5 text-left text-sm font-medium text-ink transition-all duration-150 ease-press hover:bg-canvas-sunk hover:shadow-neu-inset-sm"
                  onClick={() => handleProviderSelection(ProviderTypeEnum.CustomOpenAI)}>
                  {t('options_models_providers_openaiCompatible')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={DIVIDER} />

      {/* Updated Agent Models Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">{t('options_models_selection_header')}</h2>
        <div className="space-y-4">
          {[AgentNameEnum.Planner, AgentNameEnum.Navigator, AgentNameEnum.Fast].map(agentName => (
            <div key={agentName}>{renderModelSelect(agentName)}</div>
          ))}
        </div>
      </div>

      <div className={DIVIDER} />

      {/* Speech-to-Text Model Selection */}
      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-ink">
          {t('options_models_speechToText_header')}
        </h2>
        <p className="mb-4 text-xs text-ink-faint">{t('options_models_stt_desc')}</p>

        <div className="rounded-slab bg-canvas-raised p-5 shadow-neu">
          <label htmlFor="speech-to-text-model" className={FIELD_LABEL}>
            {t('options_models_labels_model')}
          </label>
          <div className="relative">
            <select
              id="speech-to-text-model"
              className={SELECT_WELL}
              value={selectedSpeechToTextModel}
              onChange={e => handleSpeechToTextModelChange(e.target.value)}>
              <option value="">{t('options_models_chooseModel')}</option>
              {/* Filter available models to show only Gemini models */}
              {availableModels
                .filter(({ provider }) => {
                  const providerConfig = providers[provider];
                  return providerConfig?.type === ProviderTypeEnum.Gemini;
                })
                .map(({ provider, providerName, model }) => (
                  <option key={`${provider}>${model}`} value={`${provider}>${model}`}>
                    {`${providerName} > ${model}`}
                  </option>
                ))}
            </select>
            <SelectChevron />
          </div>
        </div>
      </div>
    </section>
  );
};
