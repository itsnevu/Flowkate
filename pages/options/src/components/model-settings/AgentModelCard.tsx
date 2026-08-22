import { t } from '@extension/i18n';
import { SelectChevron } from './SelectChevron';
import { defaultReasoningEffortFor, getAgentDescription, isAnthropicModel, isOpenAIReasoningModel } from './helpers';
import { FIELD_LABEL, LABEL_BASE, SELECT_WELL, sliderTrack } from './styles';
import type { AgentNameEnum } from '@extension/storage';
import type { AvailableModel, ModelParameters, ReasoningEffort } from './types';

interface AgentModelCardProps {
  agentName: AgentNameEnum;
  availableModels: AvailableModel[];
  /** stored as `provider>model`, the same value the option carries */
  selectedModel: string;
  parameters: ModelParameters;
  reasoningEffort: ReasoningEffort | undefined;
  onModelChange: (agentName: AgentNameEnum, modelValue: string) => void;
  onParameterChange: (agentName: AgentNameEnum, paramName: 'temperature' | 'topP', value: number) => void;
  onReasoningEffortChange: (agentName: AgentNameEnum, value: ReasoningEffort) => void;
}

/**
 * One agent's model choice and its sampling knobs. Which knobs exist depends on the model:
 * reasoning models take an effort level instead of temperature, and Anthropic models are
 * given temperature only, since sending both temperature and top-p is rejected.
 */
export const AgentModelCard = ({
  agentName,
  availableModels,
  selectedModel,
  parameters,
  reasoningEffort,
  onModelChange,
  onParameterChange,
  onReasoningEffortChange,
}: AgentModelCardProps) => (
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
            value={selectedModel || ''} // Use the stored provider>model value directly
            onChange={e => onModelChange(agentName, e.target.value)}>
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
      {selectedModel && !isOpenAIReasoningModel(selectedModel) && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={`${agentName}-temperature`} className={LABEL_BASE}>
              {t('options_models_labels_temperature')}
            </label>
            <span className="font-mono text-xs text-ink-soft">{parameters.temperature.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              id={`${agentName}-temperature`}
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={parameters.temperature}
              onChange={e => onParameterChange(agentName, 'temperature', Number.parseFloat(e.target.value))}
              style={sliderTrack(parameters.temperature / 2)}
              className="h-1.5 flex-1 appearance-none rounded-pill shadow-neu-inset-sm accent-graphite-800"
            />
            <input
              type="number"
              min="0"
              max="2"
              step="0.01"
              value={parameters.temperature}
              onChange={e => {
                const value = Number.parseFloat(e.target.value);
                if (!Number.isNaN(value) && value >= 0 && value <= 2) {
                  onParameterChange(agentName, 'temperature', value);
                }
              }}
              className="w-20 rounded-soft bg-canvas-sunk px-2 py-1 text-sm text-ink shadow-neu-inset-sm transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset"
              aria-label={`${agentName} temperature number input`}
            />
          </div>
        </div>
      )}

      {/* Top P Slider - Only show for non-reasoning models */}
      {selectedModel && !isOpenAIReasoningModel(selectedModel) && !isAnthropicModel(selectedModel) && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={`${agentName}-topP`} className={LABEL_BASE}>
              {t('options_models_labels_topP')}
            </label>
            <span className="font-mono text-xs text-ink-soft">{parameters.topP.toFixed(3)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              id={`${agentName}-topP`}
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={parameters.topP}
              onChange={e => onParameterChange(agentName, 'topP', Number.parseFloat(e.target.value))}
              style={sliderTrack(parameters.topP)}
              className="h-1.5 flex-1 appearance-none rounded-pill shadow-neu-inset-sm accent-graphite-800"
            />
            <input
              type="number"
              min="0"
              max="1"
              step="0.001"
              value={parameters.topP}
              onChange={e => {
                const value = Number.parseFloat(e.target.value);
                if (!Number.isNaN(value) && value >= 0 && value <= 1) {
                  onParameterChange(agentName, 'topP', value);
                }
              }}
              className="w-20 rounded-soft bg-canvas-sunk px-2 py-1 text-sm text-ink shadow-neu-inset-sm transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset"
              aria-label={`${agentName} top P number input`}
            />
          </div>
        </div>
      )}

      {/* Reasoning Effort Selector (only for O-series models) */}
      {selectedModel && isOpenAIReasoningModel(selectedModel) && (
        <div>
          <label htmlFor={`${agentName}-reasoning-effort`} className={FIELD_LABEL}>
            {t('options_models_labels_reasoning')}
          </label>
          <div className="relative">
            <select
              id={`${agentName}-reasoning-effort`}
              value={reasoningEffort || defaultReasoningEffortFor(agentName)}
              onChange={e => onReasoningEffortChange(agentName, e.target.value as ReasoningEffort)}
              className={SELECT_WELL}>
              {/*
                'minimal', not 'minimal/none': the value is stored verbatim and forwarded to the
                provider as reasoning_effort, and 'minimal/none' is not in the ReasoningEffort union
                nor a value any provider accepts. The gpt-5.1 'minimal' -> 'none' translation already
                lives in the background (agent/helper.ts), so the UI never needs to spell 'none'.
                It also made the select render blank whenever the stored value was the real default.
              */}
              <option value="minimal">{t('options_models_reasoning_minimal')}</option>
              <option value="low">{t('options_models_reasoning_low')}</option>
              <option value="medium">{t('options_models_reasoning_medium')}</option>
              <option value="high">{t('options_models_reasoning_high')}</option>
            </select>
            <SelectChevron />
          </div>
        </div>
      )}
    </div>
  </div>
);
