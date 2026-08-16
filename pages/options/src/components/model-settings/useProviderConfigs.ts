import { useCallback, useEffect, useRef, useState } from 'react';
import {
  llmProviderStore,
  llmProviderModelNames,
  ProviderTypeEnum,
  getDefaultDisplayNameFromProviderId,
  getDefaultProviderConfig,
  seedAgentModelsFromProvider,
  checkProviderKey,
} from '@extension/storage';
import { t } from '@extension/i18n';
import { maxCustomProviderNumber, sortProviderEntries } from './helpers';
import type { KeyboardEvent } from 'react';
import type { ProviderConfig } from '@extension/storage';
import type { AvailableModel, ProviderButtonProps } from './types';

/**
 * The provider list: what is configured, what has been edited but not saved, and the flat
 * model catalogue those providers add up to.
 *
 * Storage is the source of truth and is only written on an explicit save, so the edited copy
 * lives here in state. `modifiedProviders` is what separates the two: a provider with edits
 * offers a save key, an untouched stored provider offers delete instead.
 *
 * @param onAgentModelsSeeded called when saving a provider also filled in the agents' models,
 * so the agent cards can re-read what was chosen for them.
 */
export const useProviderConfigs = (onAgentModelsSeeded?: () => void) => {
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [modifiedProviders, setModifiedProviders] = useState<Set<string>>(new Set());
  const [providersFromStorage, setProvidersFromStorage] = useState<Set<string>>(new Set());
  const [newModelInputs, setNewModelInputs] = useState<Record<string, string>>({});
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false);
  const newlyAddedProviderRef = useRef<string | null>(null);
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  // Add state for tracking API key visibility
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});
  // Create a non-async wrapper for use in render functions
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

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
    const models: AvailableModel[] = [];

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

  const getButtonProps = (provider: string): ProviderButtonProps => {
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

      // Ask the provider whether it accepts these credentials before storing them. Only an
      // outright rejection stops the save: an unreachable or unprobeable endpoint answers
      // `unknown`, and refusing on that would block perfectly good self-hosted setups.
      const verdict = await checkProviderKey(configToSave as ProviderConfig);
      if (verdict === 'rejected') {
        alert(t('options_models_providers_errors_keyRejected', getDefaultDisplayNameFromProviderId(provider)));
        return;
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

      // On a setup with no agent configured yet, this provider is enough to start: point the
      // agents at it rather than leaving the side panel locked behind two more picks the setup
      // screen never mentions. Does nothing once anything is configured.
      const seeded = await seedAgentModelsFromProvider(provider, configToSave as ProviderConfig);
      if (seeded.length > 0) onAgentModelsSeeded?.();
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

  const addCustomProvider = () => {
    const nextNumber = maxCustomProviderNumber(Object.keys(providers)) + 1;
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
  const getSortedProviders = () => sortProviderEntries(providers, providersFromStorage, modifiedProviders);

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

  return {
    providers,
    modifiedProviders,
    providersFromStorage,
    newModelInputs,
    nameErrors,
    visibleApiKeys,
    isProviderSelectorOpen,
    setIsProviderSelectorOpen,
    availableModels,
    getSortedProviders,
    getButtonProps,
    handleApiKeyChange,
    toggleApiKeyVisibility,
    handleNameChange,
    handleModelsChange,
    handleKeyDown,
    removeModel,
    addAzureDeployment,
    removeAzureDeployment,
    handleAzureApiVersionChange,
    handleSave,
    handleDelete,
    handleCancelProvider,
    handleProviderSelection,
  };
};
