import { ProviderTypeEnum } from './types';
import type { ProviderConfig } from './llmProviders';

/**
 * Whether a provider's credentials actually work.
 *
 * `unknown` is not a failure and must never be treated as one: a probe can miss because the
 * network is down, the endpoint rate-limited, or the provider is one this file has no probe
 * for. Only an outright rejection is a reason to stop a user from saving what they typed.
 */
export type ProviderKeyVerdict = 'valid' | 'rejected' | 'unknown';

/** The request that would list a provider's models, or null when there is no probe for it. */
export interface ProviderProbe {
  url: string;
  headers: Record<string, string>;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Endpoints that speak OpenAI's `GET /models`, with the base each one uses when the stored
 * config does not carry its own. A provider absent from here and not special-cased below has
 * no probe, which is reported as `unknown` rather than guessed at.
 */
const OPENAI_COMPATIBLE_BASES: Partial<Record<ProviderTypeEnum, string>> = {
  [ProviderTypeEnum.OpenAI]: 'https://api.openai.com/v1',
  [ProviderTypeEnum.DeepSeek]: 'https://api.deepseek.com/v1',
  [ProviderTypeEnum.Groq]: 'https://api.groq.com/openai/v1',
  [ProviderTypeEnum.Cerebras]: 'https://api.cerebras.ai/v1',
  [ProviderTypeEnum.OpenRouter]: 'https://openrouter.ai/api/v1',
  [ProviderTypeEnum.Llama]: 'https://api.llama.com/v1',
  [ProviderTypeEnum.Grok]: 'https://api.x.ai/v1',
};

/**
 * The cheapest request that proves a key is accepted: every provider here answers a model
 * listing without spending a token.
 */
export function providerProbe(config: ProviderConfig): ProviderProbe | null {
  const key = config.apiKey?.trim() ?? '';

  switch (config.type) {
    case ProviderTypeEnum.Anthropic:
      if (!key) return null;
      return {
        url: 'https://api.anthropic.com/v1/models',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          // Anthropic refuses browser-origin calls without this, and the side panel is a
          // browser document even though the agent itself runs in the service worker.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      };

    case ProviderTypeEnum.Gemini:
      if (!key) return null;
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        headers: {},
      };

    case ProviderTypeEnum.Ollama:
      // Local and unauthenticated: this checks the server is up and reachable, which is the
      // thing that actually goes wrong with Ollama.
      return { url: `${trimSlash(config.baseUrl || 'http://localhost:11434')}/api/tags`, headers: {} };

    // Azure keys are deployment-scoped and there is no listing every account can call, so it
    // deliberately has no probe.
    case ProviderTypeEnum.AzureOpenAI:
      return null;

    default: {
      const base = config.baseUrl?.trim() || OPENAI_COMPATIBLE_BASES[config.type as ProviderTypeEnum];
      if (!base || !key) return null;
      return { url: `${trimSlash(base)}/models`, headers: { Authorization: `Bearer ${key}` } };
    }
  }
}

/** 401 and 403 are the provider saying no. Everything else is inconclusive, including 429. */
export function verdictFromStatus(status: number, ok: boolean): ProviderKeyVerdict {
  if (ok) return 'valid';
  if (status === 401 || status === 403) return 'rejected';
  return 'unknown';
}

/**
 * Ask the provider whether it accepts these credentials.
 *
 * Times out rather than hanging a save behind an unreachable endpoint, and answers `unknown`
 * on anything it cannot interpret.
 */
export async function checkProviderKey(config: ProviderConfig, timeoutMs = 8000): Promise<ProviderKeyVerdict> {
  const probe = providerProbe(config);
  if (!probe) return 'unknown';

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(probe.url, { method: 'GET', headers: probe.headers, signal: abort.signal });
    return verdictFromStatus(response.status, response.ok);
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}
