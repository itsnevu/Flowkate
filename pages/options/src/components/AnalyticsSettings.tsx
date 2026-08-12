import { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';
import { Toggle } from './controls';
import type { AnalyticsSettingsConfig } from '@extension/storage';

/**
 * Whether this build can send telemetry at all.
 *
 * The PostHog key is a build-time secret that is deliberately absent from the repo (see
 * `.env.example`), so an open-source build compiles it in as empty and `AnalyticsService.init()`
 * disables itself. Without this check the page shows a live-looking switch and a detailed
 * "what we collect" list describing collection that provably cannot happen - which reads as a
 * false disclosure in the one panel whose entire job is to tell the truth about data.
 *
 * Read at module scope because it is a compile-time constant, not state.
 */
const TELEMETRY_CONFIGURED = Boolean(import.meta.env.VITE_POSTHOG_API_KEY);

export const AnalyticsSettings = () => {
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await analyticsSettingsStore.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('Failed to load analytics settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    // Listen for storage changes
    const unsubscribe = analyticsSettingsStore.subscribe(loadSettings);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleAnalytics = async (enabled: boolean) => {
    if (!settings) return;

    try {
      await analyticsSettingsStore.updateSettings({ enabled });
      setSettings({ ...settings, enabled });
    } catch (error) {
      console.error('Failed to update analytics settings:', error);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="text-left">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Analytics Settings</h2>
          <div className="mt-4 animate-pulse-soft space-y-2">
            <div className="h-4 w-3/4 rounded-pill bg-canvas-sunk shadow-neu-inset-sm" />
            <div className="h-4 w-1/2 rounded-pill bg-canvas-sunk shadow-neu-inset-sm" />
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-6">
        <div className="text-left">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Analytics Settings</h2>
          <p className="mt-4 text-sm text-signal-bad">Failed to load analytics settings.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="text-left">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Analytics Settings</h2>

        {!TELEMETRY_CONFIGURED && (
          <div className="mt-4 flex gap-3 rounded-soft bg-canvas-sunk p-4 shadow-neu-inset-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-ok" aria-hidden="true" />
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-ink">No analytics are collected in this build.</span> It was compiled
              without a telemetry key, so nothing is sent anywhere and the switch below has nothing to turn on. The list
              underneath describes what a build configured for analytics would collect.
            </p>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* Main toggle */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <label
                htmlFor="analytics-enabled"
                className={`text-base font-medium text-ink ${TELEMETRY_CONFIGURED ? 'cursor-pointer' : ''}`}>
                Help improve Flowkite
              </label>
              <p className="mt-1 text-sm text-ink-soft">
                {TELEMETRY_CONFIGURED
                  ? 'Share anonymous usage data to help us improve the extension'
                  : 'Unavailable: this build has no telemetry key'}
              </p>
            </div>
            <Toggle
              id="analytics-enabled"
              label="Toggle analytics"
              checked={TELEMETRY_CONFIGURED && settings.enabled}
              disabled={!TELEMETRY_CONFIGURED}
              onChange={handleToggleAnalytics}
            />
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

          {/* Information about what we collect */}
          <div className="rounded-soft bg-canvas-sunk p-5 shadow-neu-inset">
            <h3 className="text-base font-medium text-ink">
              {TELEMETRY_CONFIGURED ? 'What we collect:' : 'What a configured build would collect:'}
            </h3>
            <ul className="mt-3 space-y-2 text-left text-sm text-ink-soft">
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-info" aria-hidden="true" />
                <span>Task execution metrics (start, completion, failure counts and duration)</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-info" aria-hidden="true" />
                <span>Domain names of websites visited (e.g., &quot;amazon.com&quot;, not full URLs)</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-info" aria-hidden="true" />
                <span>Error categories for failed tasks (no sensitive details)</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-info" aria-hidden="true" />
                <span>Anonymous usage statistics</span>
              </li>
            </ul>

            <div className="my-5 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

            <h3 className="text-base font-medium text-ink">What we DON&apos;T collect:</h3>
            <ul className="mt-3 space-y-2 text-left text-sm text-ink-soft">
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-bad" aria-hidden="true" />
                <span>Personal information or login credentials</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-bad" aria-hidden="true" />
                <span>Full URLs or page content</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-bad" aria-hidden="true" />
                <span>Task instructions or user prompts</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-bad" aria-hidden="true" />
                <span>Screen recordings or screenshots</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-bad" aria-hidden="true" />
                <span>Any sensitive or private data</span>
              </li>
            </ul>
          </div>

          {/* Opt-out message. Suppressed when the build cannot send anything anyway - telling the
              user they "can re-enable it anytime" would promise a switch that does nothing. */}
          {TELEMETRY_CONFIGURED && !settings.enabled && (
            <div className="flex gap-3 rounded-soft bg-canvas-sunk p-4 shadow-neu-inset-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-signal-warn" aria-hidden="true" />
              <p className="text-sm text-signal-warn">
                Analytics disabled. You can re-enable it anytime to help improve Flowkite.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
