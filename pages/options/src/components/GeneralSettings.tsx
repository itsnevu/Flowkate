import { useState, useEffect } from 'react';
import { type GeneralSettingsConfig, generalSettingsStore, DEFAULT_GENERAL_SETTINGS } from '@extension/storage';
import { t } from '@extension/i18n';
import { Divider, SettingRow, Toggle } from './controls';

/** Number fields are milled into the card: a sunken well, no border anywhere. */
const numberFieldClass =
  'w-24 rounded-soft bg-canvas-sunk px-3 py-2 text-right text-sm font-semibold text-ink shadow-neu-inset';

export const GeneralSettings = () => {
  const [settings, setSettings] = useState<GeneralSettingsConfig>(DEFAULT_GENERAL_SETTINGS);

  useEffect(() => {
    // Load initial settings
    generalSettingsStore.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) => {
    // Optimistically update the local state for responsiveness
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));

    // Call the store to update the setting
    await generalSettingsStore.updateSettings({
      [key]: value,
    } as Partial<GeneralSettingsConfig>);

    // After the store update (which might have side effects, e.g., useVision affecting displayHighlights),
    // fetch the latest settings from the store and update the local state again to ensure UI consistency.
    const latestSettings = await generalSettingsStore.getSettings();
    setSettings(latestSettings);
  };

  return (
    <section className="text-left">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{t('options_general_header')}</h2>

      <div className="mt-4">
        <SettingRow title={t('options_general_maxSteps')} description={t('options_general_maxSteps_desc')}>
          <label htmlFor="maxSteps" className="sr-only">
            {t('options_general_maxSteps')}
          </label>
          <input
            id="maxSteps"
            type="number"
            min={1}
            max={50}
            value={settings.maxSteps}
            onChange={e => updateSetting('maxSteps', Number.parseInt(e.target.value, 10))}
            className={numberFieldClass}
          />
        </SettingRow>

        <Divider />

        <SettingRow title={t('options_general_maxActions')} description={t('options_general_maxActions_desc')}>
          <label htmlFor="maxActionsPerStep" className="sr-only">
            {t('options_general_maxActions')}
          </label>
          <input
            id="maxActionsPerStep"
            type="number"
            min={1}
            max={50}
            value={settings.maxActionsPerStep}
            onChange={e => updateSetting('maxActionsPerStep', Number.parseInt(e.target.value, 10))}
            className={numberFieldClass}
          />
        </SettingRow>

        <Divider />

        <SettingRow title={t('options_general_maxFailures')} description={t('options_general_maxFailures_desc')}>
          <label htmlFor="maxFailures" className="sr-only">
            {t('options_general_maxFailures')}
          </label>
          <input
            id="maxFailures"
            type="number"
            min={1}
            max={10}
            value={settings.maxFailures}
            onChange={e => updateSetting('maxFailures', Number.parseInt(e.target.value, 10))}
            className={numberFieldClass}
          />
        </SettingRow>

        <Divider />

        <SettingRow title={t('options_general_enableVision')} description={t('options_general_enableVision_desc')}>
          <Toggle
            id="useVision"
            label={t('options_general_enableVision')}
            checked={settings.useVision}
            onChange={checked => updateSetting('useVision', checked)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_displayHighlights')}
          description={t('options_general_displayHighlights_desc')}>
          <Toggle
            id="displayHighlights"
            label={t('options_general_displayHighlights')}
            checked={settings.displayHighlights}
            onChange={checked => updateSetting('displayHighlights', checked)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_planningInterval')}
          description={t('options_general_planningInterval_desc')}>
          <label htmlFor="planningInterval" className="sr-only">
            {t('options_general_planningInterval')}
          </label>
          <input
            id="planningInterval"
            type="number"
            min={1}
            max={20}
            value={settings.planningInterval}
            onChange={e => updateSetting('planningInterval', Number.parseInt(e.target.value, 10))}
            className={numberFieldClass}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_minWaitPageLoad')}
          description={t('options_general_minWaitPageLoad_desc')}>
          <label htmlFor="minWaitPageLoad" className="sr-only">
            {t('options_general_minWaitPageLoad')}
          </label>
          <input
            id="minWaitPageLoad"
            type="number"
            min={250}
            max={5000}
            step={50}
            value={settings.minWaitPageLoad}
            onChange={e => updateSetting('minWaitPageLoad', Number.parseInt(e.target.value, 10))}
            className={numberFieldClass}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_requirePlanApproval')}
          description={t('options_general_requirePlanApproval_desc')}>
          <Toggle
            id="requirePlanApproval"
            label={t('options_general_requirePlanApproval')}
            checked={settings.requirePlanApproval}
            onChange={checked => updateSetting('requirePlanApproval', checked)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_confirmSensitiveActions')}
          description={t('options_general_confirmSensitiveActions_desc')}>
          <Toggle
            id="confirmSensitiveActions"
            label={t('options_general_confirmSensitiveActions')}
            checked={settings.confirmSensitiveActions}
            onChange={checked => updateSetting('confirmSensitiveActions', checked)}
          />
        </SettingRow>

        <Divider />

        <SettingRow
          title={t('options_general_replayHistoricalTasks')}
          description={t('options_general_replayHistoricalTasks_desc')}>
          <Toggle
            id="replayHistoricalTasks"
            label={t('options_general_replayHistoricalTasks')}
            checked={settings.replayHistoricalTasks}
            onChange={checked => updateSetting('replayHistoricalTasks', checked)}
          />
        </SettingRow>
      </div>
    </section>
  );
};
