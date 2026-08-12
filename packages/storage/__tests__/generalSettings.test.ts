import { describe, it, expect, beforeEach } from 'vitest';
import {
  generalSettingsStore,
  DEFAULT_GENERAL_SETTINGS,
  APPROVAL_MODES,
  requiresPlanApproval,
  confirmsSensitiveActions,
  confirmsEveryAction,
  type ApprovalMode,
} from '../lib/settings/generalSettings';

/** Write a raw object straight into the store, bypassing updateSettings' normalisation. */
async function seedStorage(raw: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set({ 'general-settings': raw });
}

describe('approval mode gates', () => {
  it('maps every mode to the gates the UI promises', () => {
    // auto is total. That is the product decision the acknowledgement exists for, so pin it here:
    // anyone loosening these helpers has to delete an assertion that says why.
    expect(requiresPlanApproval('auto')).toBe(false);
    expect(confirmsSensitiveActions('auto')).toBe(false);
    expect(confirmsEveryAction('auto')).toBe(false);

    expect(requiresPlanApproval('planner')).toBe(true);
    expect(confirmsSensitiveActions('planner')).toBe(true);
    expect(confirmsEveryAction('planner')).toBe(false);

    expect(requiresPlanApproval('manual')).toBe(true);
    expect(confirmsSensitiveActions('manual')).toBe(true);
    expect(confirmsEveryAction('manual')).toBe(true);
  });

  it('gates something in every mode except auto', () => {
    for (const mode of APPROVAL_MODES) {
      const gatesNothing = !requiresPlanApproval(mode) && !confirmsSensitiveActions(mode) && !confirmsEveryAction(mode);
      expect(`${mode} gates nothing: ${gatesNothing}`).toBe(`${mode} gates nothing: ${mode === 'auto'}`);
    }
  });
});

describe('settings migration', () => {
  beforeEach(async () => {
    await chrome.storage.local.remove('general-settings');
  });

  it('gives a fresh install the documented defaults', async () => {
    const settings = await generalSettingsStore.getSettings();
    expect(settings.approvalMode).toBe('planner');
    expect(settings.autoModeAcknowledged).toBe(false);
    expect(settings.agentOverlay).toBe('off');
  });

  it('carries an existing ungated install over to auto without re-asking', async () => {
    await seedStorage({ requirePlanApproval: false, confirmSensitiveActions: false });
    const settings = await generalSettingsStore.getSettings();
    expect(settings.approvalMode).toBe('auto');
    // they already made this choice once; making them acknowledge it again would be nagging
    expect(settings.autoModeAcknowledged).toBe(true);
  });

  /**
   * The negative space, and the reason this file exists.
   *
   * A test that only checks "both false -> auto" still passes if a typo widens the condition, and
   * the failure of that typo is silent: every existing install lands with no gates at all. So assert
   * that NOTHING ELSE can produce auto.
   */
  it('never lands on auto from any other legacy combination', async () => {
    const combinations = [
      { requirePlanApproval: true, confirmSensitiveActions: true },
      { requirePlanApproval: true, confirmSensitiveActions: false },
      { requirePlanApproval: false, confirmSensitiveActions: true },
      { requirePlanApproval: false },
      { confirmSensitiveActions: false },
      {},
    ];

    for (const legacy of combinations) {
      await seedStorage(legacy);
      const settings = await generalSettingsStore.getSettings();
      expect(`${JSON.stringify(legacy)} -> ${settings.approvalMode}`).toBe(`${JSON.stringify(legacy)} -> planner`);
      expect(settings.autoModeAcknowledged).toBe(false);
    }
  });

  it('lets an explicitly stored mode win over the legacy derivation', async () => {
    await seedStorage({ approvalMode: 'manual', requirePlanApproval: false, confirmSensitiveActions: false });
    expect((await generalSettingsStore.getSettings()).approvalMode).toBe('manual');
  });

  it('falls back to planner when the stored mode is not a real mode', async () => {
    // storage is user-writable, and the Options page indexes a Record<ApprovalMode, ...> with this
    await seedStorage({ approvalMode: 'yolo' as unknown as ApprovalMode });
    expect((await generalSettingsStore.getSettings()).approvalMode).toBe('planner');
  });

  it('turns the old highlight preference off rather than honouring it', async () => {
    // the old default was `true`, so nearly everyone carrying it never chose it
    await seedStorage({ displayHighlights: true });
    expect((await generalSettingsStore.getSettings()).agentOverlay).toBe('off');
  });

  it('falls back when the stored overlay is not a real overlay', async () => {
    await seedStorage({ agentOverlay: 'sparkles' });
    expect((await generalSettingsStore.getSettings()).agentOverlay).toBe('off');
  });

  it('does not hand back keys the config says do not exist', async () => {
    await seedStorage({ displayHighlights: true, requirePlanApproval: true, confirmSensitiveActions: true });
    const settings = await generalSettingsStore.getSettings();
    for (const legacyKey of ['displayHighlights', 'requirePlanApproval', 'confirmSensitiveActions']) {
      expect(`${legacyKey} present: ${legacyKey in settings}`).toBe(`${legacyKey} present: false`);
    }
  });

  it('does not resurrect the legacy shape when an unrelated setting is saved', async () => {
    await seedStorage({ requirePlanApproval: false, confirmSensitiveActions: false, maxSteps: 42 });
    await generalSettingsStore.updateSettings({ maxSteps: 7 });

    // array form: the fake iterates its argument, and a bare string iterates as characters
    const raw = (await chrome.storage.local.get(['general-settings']))['general-settings'] as Record<string, unknown>;
    expect(raw.requirePlanApproval).toBeUndefined();
    expect(raw.confirmSensitiveActions).toBeUndefined();
    // and the derived mode is now stored explicitly, so the derivation cannot run a second time
    expect(raw.approvalMode).toBe('auto');
    expect(raw.maxSteps).toBe(7);
  });

  it('preserves settings it knows nothing about', async () => {
    await seedStorage({ groupTaskTabs: false, soundOnComplete: false });
    const settings = await generalSettingsStore.getSettings();
    expect(settings.groupTaskTabs).toBe(false);
    expect(settings.soundOnComplete).toBe(false);
    expect(settings).toMatchObject({ maxSteps: DEFAULT_GENERAL_SETTINGS.maxSteps });
  });
});
