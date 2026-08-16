import { useState, useEffect, useCallback } from 'react';
import { agentModelStore, generalSettingsStore } from '@extension/storage';

/**
 * Whether the panel may show the chat at all, plus the one general setting the chat needs.
 *
 * Both are re-read whenever the panel comes back into view: the options page is a separate
 * document, so a model configured over there is otherwise invisible here until a reload.
 *
 * `hasConfiguredModels` is `null` while the first check is in flight, so the caller can tell
 * "still looking" apart from "definitely nothing configured".
 */
export const useModelConfigGate = () => {
  const [hasConfiguredModels, setHasConfiguredModels] = useState<boolean | null>(null); // null = loading, false = no models, true = has models
  const [replayEnabled, setReplayEnabled] = useState(false);

  // Check if models are configured
  const checkModelConfiguration = useCallback(async () => {
    try {
      const configuredAgents = await agentModelStore.getConfiguredAgents();

      // Check if at least one agent (preferably Navigator) is configured
      const hasAtLeastOneModel = configuredAgents.length > 0;
      setHasConfiguredModels(hasAtLeastOneModel);
    } catch (error) {
      console.error('Error checking model configuration:', error);
      setHasConfiguredModels(false);
    }
  }, []);

  // Load general settings to check if replay is enabled
  const loadGeneralSettings = useCallback(async () => {
    try {
      const settings = await generalSettingsStore.getSettings();
      setReplayEnabled(settings.replayHistoricalTasks);
    } catch (error) {
      console.error('Error loading general settings:', error);
      setReplayEnabled(false);
    }
  }, []);

  // Check model configuration on mount
  useEffect(() => {
    checkModelConfiguration();
    loadGeneralSettings();
  }, [checkModelConfiguration, loadGeneralSettings]);

  // Re-check model configuration when the side panel becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Panel became visible, re-check configuration and settings
        checkModelConfiguration();
        loadGeneralSettings();
      }
    };

    const handleFocus = () => {
      // Panel gained focus, re-check configuration and settings
      checkModelConfiguration();
      loadGeneralSettings();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModelConfiguration, loadGeneralSettings]);

  // `recheck` is for the setup screen, which configures a model inside the panel itself: no
  // focus or visibility change happens on that path, so nothing else would re-open the gate.
  return { hasConfiguredModels, replayEnabled, recheck: checkModelConfiguration };
};
