import { useCallback, useEffect, useState } from 'react';
import { AgentNameEnum, agentModelStore, getDefaultAgentModelParams } from '@extension/storage';
import { defaultReasoningEffortFor, isAnthropicModel, isOpenAIReasoningModel } from './helpers';
import type { ModelParameters, ReasoningEffort } from './types';

/**
 * Each agent's model and how it is asked to sample.
 *
 * Unlike the provider list, these save on every change — there is no save key on an agent
 * card, so state here and storage are kept in step as the user drags a slider or picks a model.
 */
export const useAgentModelConfig = () => {
  const [selectedModels, setSelectedModels] = useState<Record<AgentNameEnum, string>>({
    [AgentNameEnum.Navigator]: '',
    [AgentNameEnum.Planner]: '',
    [AgentNameEnum.Fast]: '',
  });
  const [modelParameters, setModelParameters] = useState<Record<AgentNameEnum, ModelParameters>>({
    [AgentNameEnum.Navigator]: { temperature: 0, topP: 0 },
    [AgentNameEnum.Planner]: { temperature: 0, topP: 0 },
    [AgentNameEnum.Fast]: { temperature: 0, topP: 0 },
  });

  // State for reasoning effort for O-series models
  const [reasoningEffort, setReasoningEffort] = useState<Record<AgentNameEnum, ReasoningEffort | undefined>>({
    [AgentNameEnum.Navigator]: undefined,
    [AgentNameEnum.Planner]: undefined,
    [AgentNameEnum.Fast]: undefined,
  });

  /**
   * Read every agent's stored model back into the cards.
   *
   * Exposed as well as run on mount because storage can change from outside this hook — saving
   * a provider seeds the agents on a fresh setup, and the cards would otherwise sit empty until
   * the page was reloaded.
   */
  const reloadAgentModels = useCallback(async () => {
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
              [agent]: config.reasoningEffort as ReasoningEffort,
            }));
          }
        }
      }
      setSelectedModels(models);
    } catch (error) {
      console.error('Error loading agent models:', error);
    }
  }, []);

  // Load existing agent models and parameters on mount
  useEffect(() => {
    reloadAgentModels();
  }, [reloadAgentModels]);

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
          const defaultReasoningEffort = defaultReasoningEffortFor(agentName);
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
            ? reasoningEffort[agentName] || defaultReasoningEffortFor(agentName)
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

  const handleReasoningEffortChange = async (agentName: AgentNameEnum, value: ReasoningEffort) => {
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

  return {
    selectedModels,
    modelParameters,
    reasoningEffort,
    handleModelChange,
    handleReasoningEffortChange,
    handleParameterChange,
    reloadAgentModels,
  };
};
