/*
 * Changes:
 * - Added a searchable select component with filtering capability for model selection
 * - Implemented keyboard navigation and accessibility for the custom dropdown
 * - Added search functionality that filters models based on user input
 * - Added keyboard event handlers to close dropdowns with Escape key
 * - Restyled onto the "soft machine" design system: pale canvas ground, raised
 *   provider cards, sunken wells for every input and graphite keys for actions
 * - Split into ./model-settings: the cards and menus render, the hooks hold the state
 */
import { AgentNameEnum, ProviderTypeEnum } from '@extension/storage';
import { t } from '@extension/i18n';
import { AddProviderMenu } from './model-settings/AddProviderMenu';
import { AgentModelCard } from './model-settings/AgentModelCard';
import { ProviderCard } from './model-settings/ProviderCard';
import { SpeechToTextCard } from './model-settings/SpeechToTextCard';
import { useAgentModelConfig } from './model-settings/useAgentModelConfig';
import { useProviderConfigs } from './model-settings/useProviderConfigs';
import { useSpeechToTextConfig } from './model-settings/useSpeechToTextConfig';
import { DIVIDER } from './model-settings/styles';

export const ModelSettings = () => {
  // Before the provider list, which needs `reloadAgentModels` to show what saving a provider
  // picked for the agents on a setup that had nothing configured.
  const {
    selectedModels,
    modelParameters,
    reasoningEffort,
    handleModelChange,
    handleReasoningEffortChange,
    handleParameterChange,
    reloadAgentModels,
  } = useAgentModelConfig();

  const {
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
  } = useProviderConfigs(reloadAgentModels);

  const { selectedSpeechToTextModel, handleSpeechToTextModelChange } = useSpeechToTextConfig();

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
              const providerType = providerConfig?.type;
              if (!providerConfig || !providerType) {
                console.warn(`Skipping rendering for providerId ${providerId} due to missing config or type`);
                return null; // Skip rendering this item if config/type is somehow missing
              }

              const isNewProvider = modifiedProviders.has(providerId) && !providersFromStorage.has(providerId);

              return (
                <ProviderCard
                  key={providerId}
                  providerId={providerId}
                  providerConfig={providerConfig}
                  providerType={providerType}
                  isNewProvider={isNewProvider}
                  buttonProps={getButtonProps(providerId)}
                  nameError={nameErrors[providerId]}
                  apiKeyVisible={Boolean(visibleApiKeys[providerId])}
                  modelInput={newModelInputs[providerId] || ''}
                  onNameChange={name => handleNameChange(providerId, name)}
                  onApiKeyChange={(apiKey, baseUrl) => handleApiKeyChange(providerId, apiKey, baseUrl)}
                  onToggleApiKeyVisibility={() => toggleApiKeyVisibility(providerId)}
                  onModelInputChange={value => handleModelsChange(providerId, value)}
                  onModelInputKeyDown={e => handleKeyDown(e, providerId)}
                  onRemoveModel={model => removeModel(providerId, model)}
                  onAddAzureDeployment={deploymentName => addAzureDeployment(providerId, deploymentName)}
                  onRemoveAzureDeployment={deploymentName => removeAzureDeployment(providerId, deploymentName)}
                  onAzureApiVersionChange={apiVersion => handleAzureApiVersionChange(providerId, apiVersion)}
                  onCancel={() => handleCancelProvider(providerId)}
                  onPrimaryAction={() =>
                    providersFromStorage.has(providerId) && !modifiedProviders.has(providerId)
                      ? handleDelete(providerId)
                      : handleSave(providerId)
                  }
                />
              );
            })
          )}

          {/* Add Provider button and dropdown */}
          <AddProviderMenu
            isOpen={isProviderSelectorOpen}
            onToggle={() => setIsProviderSelectorOpen(prev => !prev)}
            providersFromStorage={providersFromStorage}
            modifiedProviders={modifiedProviders}
            onSelect={handleProviderSelection}
          />
        </div>
      </div>

      <div className={DIVIDER} />

      {/* Updated Agent Models Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">{t('options_models_selection_header')}</h2>
        <div className="space-y-4">
          {[AgentNameEnum.Planner, AgentNameEnum.Navigator, AgentNameEnum.Fast].map(agentName => (
            <div key={agentName}>
              <AgentModelCard
                agentName={agentName}
                availableModels={availableModels}
                selectedModel={selectedModels[agentName]}
                parameters={modelParameters[agentName]}
                reasoningEffort={reasoningEffort[agentName]}
                onModelChange={handleModelChange}
                onParameterChange={handleParameterChange}
                onReasoningEffortChange={handleReasoningEffortChange}
              />
            </div>
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

        {/* Filter available models to show only Gemini models */}
        <SpeechToTextCard
          models={availableModels.filter(({ provider }) => {
            const providerConfig = providers[provider];
            return providerConfig?.type === ProviderTypeEnum.Gemini;
          })}
          value={selectedSpeechToTextModel}
          onChange={handleSpeechToTextModelChange}
        />
      </div>
    </section>
  );
};
