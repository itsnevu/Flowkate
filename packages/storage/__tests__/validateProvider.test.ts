import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkProviderKey, providerProbe, verdictFromStatus } from '../lib/settings/validateProvider';
import { ProviderTypeEnum } from '../lib/settings/types';
import type { ProviderConfig } from '../lib/settings/llmProviders';

const config = (over: Partial<ProviderConfig>): ProviderConfig =>
  ({ name: 'p', type: ProviderTypeEnum.OpenAI, apiKey: 'k', ...over }) as ProviderConfig;

describe('providerProbe', () => {
  it('lists models on the OpenAI-compatible providers, bearing the key', () => {
    const probe = providerProbe(config({ type: ProviderTypeEnum.OpenAI, apiKey: 'sk-1' }));

    expect(probe).toEqual({ url: 'https://api.openai.com/v1/models', headers: { Authorization: 'Bearer sk-1' } });
  });

  it('prefers a stored base URL and does not double its trailing slash', () => {
    const probe = providerProbe(config({ type: ProviderTypeEnum.CustomOpenAI, baseUrl: 'https://mine.test/v1/' }));

    expect(probe?.url).toBe('https://mine.test/v1/models');
  });

  it("sends Anthropic's browser-access header, without which the call is refused outright", () => {
    const probe = providerProbe(config({ type: ProviderTypeEnum.Anthropic, apiKey: 'sk-ant' }));

    expect(probe?.url).toBe('https://api.anthropic.com/v1/models');
    expect(probe?.headers['x-api-key']).toBe('sk-ant');
    expect(probe?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('puts the Gemini key in the query string, escaped', () => {
    const probe = providerProbe(config({ type: ProviderTypeEnum.Gemini, apiKey: 'a b&c' }));

    expect(probe?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=a%20b%26c');
  });

  it('checks that Ollama is up rather than that a key is good', () => {
    const probe = providerProbe(
      config({ type: ProviderTypeEnum.Ollama, apiKey: '', baseUrl: 'http://localhost:11434' }),
    );

    expect(probe).toEqual({ url: 'http://localhost:11434/api/tags', headers: {} });
  });

  it('has no probe for Azure, whose keys are deployment-scoped', () => {
    expect(
      providerProbe(config({ type: ProviderTypeEnum.AzureOpenAI, baseUrl: 'https://x.openai.azure.com' })),
    ).toBeNull();
  });

  it('has no probe for a custom provider with no address, and none for a missing key', () => {
    expect(providerProbe(config({ type: ProviderTypeEnum.CustomOpenAI, baseUrl: '' }))).toBeNull();
    expect(providerProbe(config({ type: ProviderTypeEnum.OpenAI, apiKey: '  ' }))).toBeNull();
  });
});

/**
 * The verdict decides whether a save is blocked, so the only status that may stop a user is one
 * where the provider actually said no. Rate limits and outages must stay out of the way.
 */
describe('verdictFromStatus', () => {
  it.each([
    [200, true, 'valid'],
    [401, false, 'rejected'],
    [403, false, 'rejected'],
    [429, false, 'unknown'],
    [500, false, 'unknown'],
    [404, false, 'unknown'],
  ])('reads %i as %s', (status, ok, expected) => {
    expect(verdictFromStatus(status, ok)).toBe(expected);
  });
});

describe('checkProviderKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports a rejection from the provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(checkProviderKey(config({ apiKey: 'bad' }))).resolves.toBe('rejected');
  });

  it('stays unknown when the request fails outright, so a save is never blocked by the network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(checkProviderKey(config({ apiKey: 'k' }))).resolves.toBe('unknown');
  });

  it('does not call out at all for a provider it cannot probe', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkProviderKey(config({ type: ProviderTypeEnum.AzureOpenAI }))).resolves.toBe('unknown');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
