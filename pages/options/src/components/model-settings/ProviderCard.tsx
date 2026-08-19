import { ProviderTypeEnum, llmProviderModelNames } from '@extension/storage';
import { t } from '@extension/i18n';
import { getProviderTypeLabel } from './helpers';
import { OpenRouterModelField } from './OpenRouterModelField';
import {
  CHIP,
  CHIP_REMOVE,
  FIELD_HINT,
  FIELD_LABEL,
  FIELD_WELL,
  ICON_KEY,
  KEY_PRIMARY,
  KEY_SECONDARY,
  TAG_INPUT,
  TAG_WELL,
} from './styles';
import type { KeyboardEvent } from 'react';
import type { ProviderConfig } from '@extension/storage';
import type { ProviderButtonProps } from './types';

interface ProviderCardProps {
  providerId: string;
  providerConfig: ProviderConfig;
  /** narrowed by the caller, which drops any provider whose config lost its type */
  providerType: ProviderTypeEnum;
  /** added in this session and not yet written to storage */
  isNewProvider: boolean;
  buttonProps: ProviderButtonProps;
  nameError?: string;
  apiKeyVisible: boolean;
  /** the pending text in the models / deployments tag field */
  modelInput: string;
  onNameChange: (name: string) => void;
  onApiKeyChange: (apiKey: string, baseUrl?: string) => void;
  onToggleApiKeyVisibility: () => void;
  onModelInputChange: (value: string) => void;
  onModelInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Adds one model outright, which is what picking a suggestion from the OpenRouter list does. */
  onAddModel: (model: string) => void;
  onRemoveModel: (model: string) => void;
  onAddAzureDeployment: (deploymentName: string) => void;
  onRemoveAzureDeployment: (deploymentName: string) => void;
  onAzureApiVersionChange: (apiVersion: string) => void;
  onCancel: () => void;
  /** save or delete, depending on whether this card has unsaved edits */
  onPrimaryAction: () => void;
}

/**
 * One provider's credentials and model list. Which fields appear is driven entirely by the
 * provider type: Azure works in deployments rather than model names, the local and
 * OpenAI-compatible types need a base URL, and only the hosted ones require a key.
 */
export const ProviderCard = ({
  providerId,
  providerConfig,
  providerType,
  isNewProvider,
  buttonProps,
  nameError,
  apiKeyVisible,
  modelInput,
  onNameChange,
  onApiKeyChange,
  onToggleApiKeyVisibility,
  onModelInputChange,
  onModelInputKeyDown,
  onAddModel,
  onRemoveModel,
  onAddAzureDeployment,
  onRemoveAzureDeployment,
  onAzureApiVersionChange,
  onCancel,
  onPrimaryAction,
}: ProviderCardProps) => (
  /*
    `relative z-0 focus-within:z-30` is what keeps this card's own overlays - the OpenRouter model
    list - above the Add New Provider key that follows it in the DOM.

    `animate-rise` is declared with `animation-fill-mode: both`, so a newly added card keeps
    `transform: translateY(0)` forever once the animation ends, and any transform other than `none`
    is a permanent stacking context. That trapped the list's own z-index inside the card, while the
    card itself - unpositioned - painted below the positioned menu below it. Lifting the whole card
    on focus fixes it for an animated and a settled card alike, and drops it back to z-0 afterwards
    so the Add New Provider menu still opens over every card.
  */
  <div
    id={`provider-${providerId}`}
    className={`relative z-0 rounded-slab bg-canvas-raised p-5 shadow-neu focus-within:z-30 ${isNewProvider ? 'animate-rise' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-ink">{providerConfig.name || providerId}</h3>
        <span className="mt-1.5 inline-flex rounded-pill bg-graphite px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-graphite-50 shadow-key-sm">
          {getProviderTypeLabel(providerType)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Show Cancel button for newly added providers */}
        {isNewProvider && (
          <button type="button" className={KEY_SECONDARY} onClick={onCancel}>
            {t('options_models_providers_btnCancel')}
          </button>
        )}
        <button
          type="button"
          className={buttonProps.variant === 'danger' ? `${KEY_SECONDARY} text-signal-bad` : KEY_PRIMARY}
          disabled={buttonProps.disabled}
          onClick={onPrimaryAction}>
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
      {providerType === ProviderTypeEnum.CustomOpenAI && (
        <div>
          <label htmlFor={`${providerId}-name`} className={FIELD_LABEL}>
            {t('options_models_providers_custom_name')}
          </label>
          <input
            id={`${providerId}-name`}
            type="text"
            placeholder={t('options_models_providers_custom_name_placeholder')}
            value={providerConfig.name || ''}
            onChange={e => onNameChange(e.target.value)}
            className={FIELD_WELL}
          />
          {nameError ? (
            <p className="mt-1.5 text-xs text-signal-bad">{nameError}</p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-faint">{t('options_models_providers_custom_name_desc')}</p>
          )}
        </div>
      )}

      {/* API Key input with label */}
      <div>
        <label htmlFor={`${providerId}-api-key`} className={FIELD_LABEL}>
          {t('options_models_providers_apiKey')}
          {providerType !== ProviderTypeEnum.CustomOpenAI && providerType !== ProviderTypeEnum.Ollama && (
            <span className="ml-0.5 text-signal-bad" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${providerId}-api-key`}
            // Revealing the key swaps this field to plain text, which is what the eye
            // beside it has always promised. It used to echo the key into a separate
            // block underneath instead, and that block looked exactly like a second,
            // unlabelled input.
            type={apiKeyVisible ? 'text' : 'password'}
            placeholder={
              providerType === ProviderTypeEnum.CustomOpenAI
                ? t('options_models_providers_apiKey_placeholder_optional')
                : providerType === ProviderTypeEnum.Ollama
                  ? t('options_models_providers_apiKey_placeholder_ollama')
                  : t('options_models_providers_apiKey_placeholder_required')
            }
            value={providerConfig.apiKey || ''}
            onChange={e => onApiKeyChange(e.target.value, providerConfig.baseUrl)}
            className={`${FIELD_WELL} font-mono`}
          />
          {/* Offered whenever there is a key to check, not only on a provider added in
              this session: a saved key is exactly the one you come back to verify. */}
          {providerConfig.apiKey && (
            <button
              type="button"
              className={ICON_KEY}
              onClick={onToggleApiKeyVisibility}
              aria-label={
                apiKeyVisible ? t('options_models_providers_apiKey_hide') : t('options_models_providers_apiKey_show')
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
                  {apiKeyVisible
                    ? t('options_models_providers_apiKey_hide')
                    : t('options_models_providers_apiKey_show')}
                </title>
                {apiKeyVisible ? (
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
      </div>

      {/* Base URL input (for custom_openai, ollama, azure_openai, openrouter, and llama) */}
      {(providerType === ProviderTypeEnum.CustomOpenAI ||
        providerType === ProviderTypeEnum.Ollama ||
        providerType === ProviderTypeEnum.AzureOpenAI ||
        providerType === ProviderTypeEnum.OpenRouter ||
        providerType === ProviderTypeEnum.Llama) && (
        <div>
          <label htmlFor={`${providerId}-base-url`} className={FIELD_LABEL}>
            {/* Adjust Label based on provider */}
            {providerType === ProviderTypeEnum.AzureOpenAI
              ? t('options_models_providers_endpoint')
              : t('options_models_providers_baseUrl')}
            {/* OpenRouter has a default, so not strictly required, but needed for save button */}
            {(providerType === ProviderTypeEnum.CustomOpenAI || providerType === ProviderTypeEnum.AzureOpenAI) && (
              <span className="ml-0.5 text-signal-bad" aria-hidden="true">
                *
              </span>
            )}
          </label>
          <input
            id={`${providerId}-base-url`}
            type="text"
            placeholder={
              providerType === ProviderTypeEnum.CustomOpenAI
                ? t('options_models_providers_placeholders_baseUrl_custom')
                : providerType === ProviderTypeEnum.AzureOpenAI
                  ? t('options_models_providers_placeholders_baseUrl_azure')
                  : providerType === ProviderTypeEnum.OpenRouter
                    ? t('options_models_providers_placeholders_baseUrl_openrouter')
                    : providerType === ProviderTypeEnum.Llama
                      ? t('options_models_providers_placeholders_baseUrl_llama')
                      : t('options_models_providers_placeholders_baseUrl_ollama')
            }
            value={providerConfig.baseUrl || ''}
            onChange={e => onApiKeyChange(providerConfig.apiKey || '', e.target.value)}
            className={FIELD_WELL}
          />
        </div>
      )}

      {/* Azure Deployment Name input as tags/chips like OpenRouter models */}
      {providerType === ProviderTypeEnum.AzureOpenAI && (
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
                      onClick={() => onRemoveAzureDeployment(deploymentName)}
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
              value={modelInput}
              onChange={e => onModelInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const value = modelInput;
                  if (value.trim()) {
                    onAddAzureDeployment(value.trim());
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
      {providerType === ProviderTypeEnum.AzureOpenAI && (
        <div>
          <label htmlFor={`${providerId}-azure-version`} className={FIELD_LABEL}>
            {t('options_models_providers_apiVersion')}*
          </label>
          <input
            id={`${providerId}-azure-version`}
            type="text"
            placeholder={t('options_models_providers_placeholders_azureApiVersion')}
            value={providerConfig.azureApiVersion || ''}
            onChange={e => onAzureApiVersionChange(e.target.value)}
            className={FIELD_WELL}
          />
        </div>
      )}

      {/* Models input section (for non-Azure providers) */}
      {providerType === ProviderTypeEnum.OpenRouter ? (
        /*
          OpenRouter gets a search over its own catalogue rather than a blank box. It is the one
          provider where the right answer is an exact id out of several hundred, and where a
          sizeable minority of those ids cannot drive an agent at all.
        */
        <OpenRouterModelField
          providerId={providerId}
          selected={providerConfig.modelNames ?? []}
          query={modelInput}
          onQueryChange={onModelInputChange}
          onAdd={onAddModel}
          onRemove={onRemoveModel}
        />
      ) : providerType !== ProviderTypeEnum.AzureOpenAI ? (
        <div>
          <label htmlFor={`${providerId}-models-input`} className={FIELD_LABEL}>
            {t('options_models_providers_models')}
          </label>
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
                    onClick={() => onRemoveModel(model)}
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
              placeholder={t('options_models_providers_placeholders_models')}
              value={modelInput}
              onChange={e => onModelInputChange(e.target.value)}
              onKeyDown={onModelInputKeyDown}
              className={TAG_INPUT}
            />
          </div>
          <p className={FIELD_HINT}>{t('options_models_providers_models_instructions')}</p>
        </div>
      ) : null}

      {/* Ollama reminder at the bottom of the section */}
      {providerType === ProviderTypeEnum.Ollama && (
        <div className="rounded-soft bg-canvas-sunk p-3 shadow-neu-inset">
          <p className="text-xs leading-relaxed text-ink-soft">
            <code className="rounded bg-graphite px-1.5 py-0.5 font-mono text-[11px] text-graphite-50 shadow-key-sm">
              OLLAMA_ORIGINS=chrome-extension://*
            </code>{' '}
            {t('options_models_providers_ollama_reminder')}
            <a
              href="https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama"
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
