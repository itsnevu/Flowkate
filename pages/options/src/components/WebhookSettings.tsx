import { useState, useEffect } from 'react';
import { webhookStore, isValidWebhookUrl, DEFAULT_WEBHOOK_CONFIG } from '@extension/storage';
import { t } from '@extension/i18n';
import { SettingRow, Toggle } from './controls';
import type { WebhookConfig } from '@extension/storage';

const urlFieldClass =
  'w-full rounded-soft bg-canvas-sunk px-3 py-2 text-sm text-ink shadow-neu-inset outline-none placeholder:text-ink-faint';

const testButtonClass =
  'rounded-soft bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none';

/**
 * The outbound webhook pane. Off by default and outbound only: when a task finishes, its outcome
 * is POSTed to the one URL entered here — n8n, Zapier, a Discord webhook. HTTPS anywhere, plain
 * HTTP only to localhost, because task results can contain page content.
 */
export const WebhookSettings = () => {
  const [config, setConfig] = useState<WebhookConfig>(DEFAULT_WEBHOOK_CONFIG);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    const load = () => webhookStore.getConfig().then(setConfig).catch(console.error);
    load();
    return webhookStore.subscribe(load);
  }, []);

  const update = (patch: Partial<WebhookConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    void webhookStore.updateConfig(patch).catch(console.error);
  };

  const urlInvalid = config.url.trim() !== '' && !isValidWebhookUrl(config.url.trim());

  const handleTest = async () => {
    setTestState('sending');
    try {
      const response = await fetch(config.url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          task: 'Webhook test from Flowkite settings',
          outcome: 'ok',
          result: 'If you can read this, the webhook works.',
          startedAt: Date.now(),
          finishedAt: Date.now(),
        }),
      });
      setTestState(response.ok ? 'ok' : 'fail');
    } catch {
      setTestState('fail');
    }
  };

  return (
    <div className="py-4">
      <h3 className="text-sm font-semibold tracking-tight text-ink">{t('options_webhook_header')}</h3>
      <p className="mt-0.5 text-sm font-normal text-ink-soft">{t('options_webhook_desc')}</p>

      <SettingRow title={t('options_webhook_enable')} description={t('options_webhook_enable_desc')}>
        <Toggle
          id="webhookEnabled"
          label={t('options_webhook_enable')}
          checked={config.enabled}
          onChange={checked => update({ enabled: checked })}
        />
      </SettingRow>

      <div className="pb-3">
        <label htmlFor="webhookUrl" className="sr-only">
          {t('options_webhook_url')}
        </label>
        <input
          id="webhookUrl"
          type="url"
          value={config.url}
          onChange={e => update({ url: e.target.value })}
          placeholder="https://example.com/webhook"
          className={urlFieldClass}
        />
        {urlInvalid && <p className="mt-1.5 text-xs text-signal-warn">{t('options_webhook_urlInvalid')}</p>}
      </div>

      <SettingRow title={t('options_webhook_sendScheduled')} description={t('options_webhook_sendScheduled_desc')}>
        <Toggle
          id="webhookScheduled"
          label={t('options_webhook_sendScheduled')}
          checked={config.sendScheduled}
          onChange={checked => update({ sendScheduled: checked })}
        />
      </SettingRow>

      <SettingRow title={t('options_webhook_sendManual')} description={t('options_webhook_sendManual_desc')}>
        <Toggle
          id="webhookManual"
          label={t('options_webhook_sendManual')}
          checked={config.sendManual}
          onChange={checked => update({ sendManual: checked })}
        />
      </SettingRow>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={!isValidWebhookUrl(config.url.trim()) || testState === 'sending'}
          className={testButtonClass}>
          {testState === 'sending' ? t('options_webhook_testing') : t('options_webhook_test')}
        </button>
        {testState === 'ok' && <span className="text-sm text-signal-ok">{t('options_webhook_testOk')}</span>}
        {testState === 'fail' && <span className="text-sm text-signal-bad">{t('options_webhook_testFail')}</span>}
      </div>
    </div>
  );
};
