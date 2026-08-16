import { useState } from 'react';
import { t } from '@extension/i18n';
import {
  agentModelStore,
  checkProviderKey,
  getDefaultDisplayNameFromProviderId,
  getDefaultProviderConfig,
  llmProviderStore,
  ProviderTypeEnum,
  seedAgentModelsFromProvider,
} from '@extension/storage';
import { QUICK_START_URL, X_URL } from '../constants';
import type { FormEvent } from 'react';

/** Quiet footer link on the pale ground. */
const quietLinkClass = 'text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline';

const FIELD_LABEL = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-soft';
const FIELD_WELL =
  'w-full rounded-soft bg-canvas-sunk px-3 py-2 text-sm text-ink shadow-neu-inset-sm placeholder:text-ink-faint transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset';

/**
 * The four the panel offers by itself: the three keyed providers most people arrive with, and
 * Ollama, which is the whole free path. Everything else lives in Options, one link below.
 */
const PANEL_PROVIDERS = [
  ProviderTypeEnum.OpenAI,
  ProviderTypeEnum.Anthropic,
  ProviderTypeEnum.Gemini,
  ProviderTypeEnum.Ollama,
] as const;

/**
 * Shown instead of the chat while no model is configured, and set up right here rather than
 * handing the user off to the options page.
 *
 * The handoff was the problem: the panel is gated on an agent having a model, so a user who
 * followed the old instruction to "configure your API keys" came back to this same screen with
 * nothing saying two more picks were needed. One provider and one key is genuinely all it
 * takes, so that is what this asks for.
 */
const SetupGuide = ({ onConfigured }: { onConfigured: () => void }) => {
  const [providerId, setProviderId] = useState<(typeof PANEL_PROVIDERS)[number]>(ProviderTypeEnum.OpenAI);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOllama = providerId === ProviderTypeEnum.Ollama;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (!isOllama && !apiKey.trim()) {
      setError(t('welcome_errors_apiKeyRequired'));
      return;
    }
    if (isOllama && !baseUrl.trim()) {
      setError(t('welcome_errors_baseUrlRequired'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const config = getDefaultProviderConfig(providerId);
      // Ollama's default config already carries its placeholder key; the others take the
      // user's. Trimmed, because a pasted key picks up whitespace far more often than not.
      if (isOllama) {
        config.baseUrl = baseUrl.trim();
      } else {
        config.apiKey = apiKey.trim();
      }

      // Ask the provider before storing anything. Without this, a mistyped key is only
      // discovered by the first task, mid-run, as a model error - after a plan the user
      // already approved. Only an outright rejection stops the save: `unknown` covers a
      // provider being down or unprobeable, which is no reason to refuse what they typed.
      // Ollama is the exception: there is no key to reject, so the meaningful failure is
      // "nothing answered", and that is also what the agent would hit later. Its probe has to
      // pass outright, which is fair because it is local and a minute to fix.
      setChecking(true);
      const verdict = await checkProviderKey(config);
      setChecking(false);
      if (verdict === 'rejected' || (isOllama && verdict !== 'valid')) {
        setError(
          isOllama
            ? t('welcome_errors_ollamaUnreachable')
            : t('welcome_errors_keyRejected', getDefaultDisplayNameFromProviderId(providerId)),
        );
        return;
      }

      await llmProviderStore.setProvider(providerId, config);
      await seedAgentModelsFromProvider(providerId, config);

      // Ask storage rather than trusting the seed's return: seeding is deliberately a no-op
      // when something is already configured, and either way what matters here is whether the
      // panel's gate will now open.
      const configured = await agentModelStore.getConfiguredAgents();
      if (configured.length === 0) {
        setError(t('welcome_errors_noModel'));
        return;
      }
      onConfigured();
    } catch (saveError) {
      console.error('Setup failed:', saveError);
      setError(t('welcome_errors_saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-md animate-rise rounded-slab bg-canvas-raised px-6 py-8 shadow-neu">
        <img src="mark.png" alt="Flowkite" className="mx-auto mb-5 size-14" />
        <h3 className="mb-2 text-center text-lg font-semibold tracking-tight text-ink">{t('welcome_title')}</h3>
        <p className="mb-6 text-center text-sm leading-relaxed text-ink-soft">{t('welcome_instruction')}</p>

        <form onSubmit={handleSubmit} className="text-left">
          <label htmlFor="setup-provider" className={FIELD_LABEL}>
            {t('welcome_provider')}
          </label>
          <select
            id="setup-provider"
            value={providerId}
            onChange={event => {
              setProviderId(event.target.value as (typeof PANEL_PROVIDERS)[number]);
              setError(null);
            }}
            className={`${FIELD_WELL} mb-4`}>
            {PANEL_PROVIDERS.map(id => (
              <option key={id} value={id}>
                {getDefaultDisplayNameFromProviderId(id)}
              </option>
            ))}
          </select>

          {isOllama ? (
            <>
              <label htmlFor="setup-base-url" className={FIELD_LABEL}>
                {t('welcome_baseUrl')}
              </label>
              <input
                id="setup-base-url"
                type="url"
                value={baseUrl}
                onChange={event => {
                  setBaseUrl(event.target.value);
                  setError(null);
                }}
                className={`${FIELD_WELL} font-mono`}
              />
              <p className="mb-4 mt-2 text-xs leading-relaxed text-ink-faint">{t('welcome_ollamaNote')}</p>
            </>
          ) : (
            <>
              <label htmlFor="setup-api-key" className={FIELD_LABEL}>
                {t('welcome_apiKey')}
              </label>
              <input
                id="setup-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={t('welcome_apiKey_placeholder')}
                onChange={event => {
                  setApiKey(event.target.value);
                  // Clear as they type: a complaint about a missing key has no business
                  // still being on screen once one is being typed.
                  setError(null);
                }}
                className={`${FIELD_WELL} mb-4 font-mono`}
              />
            </>
          )}

          {error && (
            <p role="alert" className="mb-3 text-xs leading-relaxed text-signal-bad">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-soft bg-graphite px-5 py-2.5 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
            {checking ? t('welcome_checking') : saving ? t('welcome_saving') : t('welcome_start')}
          </button>
        </form>

        <div className="mt-8 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <button type="button" onClick={() => chrome.runtime.openOptionsPage()} className={quietLinkClass}>
            {t('welcome_openSettings')}
          </button>
          <span aria-hidden="true" className="text-ink-faint">
            •
          </span>
          <a href={QUICK_START_URL} target="_blank" rel="noopener noreferrer" className={quietLinkClass}>
            {t('welcome_quickStart')}
          </a>
          <span aria-hidden="true" className="text-ink-faint">
            •
          </span>
          <a href={X_URL} target="_blank" rel="noopener noreferrer" className={quietLinkClass}>
            {t('welcome_joinCommunity')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default SetupGuide;
