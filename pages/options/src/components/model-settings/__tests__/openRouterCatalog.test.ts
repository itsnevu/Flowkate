import { describe, it, expect, vi } from 'vitest';
import {
  baseModelId,
  classifyModel,
  countUsable,
  formatContextLength,
  formatPromptPrice,
  isBatchVariant,
  loadOpenRouterCatalog,
  matchModels,
  normalizeCatalog,
  verdictForId,
} from '../openRouterCatalog';
import type { CatalogStorage, OpenRouterModel } from '../openRouterCatalog';

/** A catalogue entry with only the fields a given test cares about spelled out. */
function model(id: string, overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return {
    id,
    name: id,
    supportedParameters: ['tools'],
    promptPrice: null,
    contextLength: null,
    acceptsImages: false,
    ...overrides,
  };
}

/** The shape of one entry as OpenRouter actually sends it, which is not the shape we store. */
function payloadEntry(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Vendor: ${id}`,
    context_length: 128000,
    architecture: { input_modalities: ['text'] },
    pricing: { prompt: '0.0000003' },
    supported_parameters: ['tools', 'temperature'],
    ...extra,
  };
}

function fakeStorage(initial: Record<string, unknown> = {}): CatalogStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (keys: string[]) => Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('batch variants', () => {
  it('recognises the suffix and names the model it was cut from', () => {
    expect(isBatchVariant('google/gemini-3.6-flash:batch')).toBe(true);
    expect(isBatchVariant('google/gemini-3.6-flash')).toBe(false);
    expect(baseModelId('google/gemini-3.6-flash:batch')).toBe('google/gemini-3.6-flash');
  });

  // The suffix is not a variant of the same endpoint, it is a different API. `:free` and the other
  // OpenRouter suffixes are ordinary chat models and must not be swept up with it.
  it('leaves other suffixed variants alone', () => {
    expect(isBatchVariant('deepseek/deepseek-r1:free')).toBe(false);
    expect(baseModelId('deepseek/deepseek-r1:free')).toBe('deepseek/deepseek-r1:free');
  });
});

describe('classifyModel', () => {
  it.each([['tools'], ['response_format'], ['structured_outputs']])('accepts a model offering %s', parameter => {
    expect(classifyModel(model('vendor/some-model', { supportedParameters: [parameter, 'temperature'] }))).toBe('ok');
  });

  // The real shape of the model that started this: tool calling but no response_format at all.
  it('accepts a model that has tool calling but no JSON schema', () => {
    const stepfun = model('stepfun/step-3.5-flash', {
      supportedParameters: ['max_tokens', 'temperature', 'tool_choice', 'tools', 'top_p'],
    });
    expect(classifyModel(stepfun)).toBe('ok');
  });

  it('rejects a model offering neither', () => {
    expect(classifyModel(model('vendor/plain', { supportedParameters: ['temperature', 'top_p'] }))).toBe(
      'noStructuredOutput',
    );
  });

  it('rejects a batch variant however capable it claims to be', () => {
    expect(classifyModel(model('google/gemini-3.6-flash:batch'))).toBe('batchOnly');
  });
});

describe('verdictForId', () => {
  const catalog = [model('vendor/good'), model('vendor/plain', { supportedParameters: [] })];

  it('reads the verdict out of the catalogue', () => {
    expect(verdictForId(catalog, 'vendor/good')).toBe('ok');
    expect(verdictForId(catalog, 'vendor/plain')).toBe('noStructuredOutput');
  });

  // A model that shipped this morning, or a cache from last week. Calling that a mistake would put
  // a warning under a config that is perfectly fine.
  it('says nothing about a model the catalogue has not heard of', () => {
    expect(verdictForId(catalog, 'vendor/brand-new')).toBe('unknown');
  });

  it('still catches a batch variant when the catalogue never loaded', () => {
    expect(verdictForId(null, 'google/gemini-3.6-flash:batch')).toBe('batchOnly');
    expect(verdictForId(null, 'google/gemini-3.6-flash')).toBe('unknown');
  });
});

describe('matchModels', () => {
  const catalog = [
    model('google/gemini-2.5-flash', { name: 'Google: Gemini 2.5 Flash' }),
    model('google/gemini-2.5-flash-lite-preview-09-2025', { name: 'Google: Gemini 2.5 Flash Lite' }),
    model('google/gemini-2.5-flash:batch', { name: 'Google: Gemini 2.5 Flash' }),
    model('anthropic/claude-sonnet-4-5', { name: 'Anthropic: Claude Sonnet 4.5' }),
  ];

  it('never suggests a batch variant, because none of them can be used', () => {
    const ids = matchModels(catalog, 'gemini').map(entry => entry.id);
    expect(ids).not.toContain('google/gemini-2.5-flash:batch');
  });

  it('puts the plain model ahead of its longer spin-offs', () => {
    expect(matchModels(catalog, 'gemini-2.5-flash')[0].id).toBe('google/gemini-2.5-flash');
  });

  // How people actually remember a model they saw once, rather than its exact punctuation.
  it('matches terms independently, so a space stands in for the rest of the id', () => {
    expect(matchModels(catalog, 'claude sonnet').map(entry => entry.id)).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('searches the display name as well as the id', () => {
    expect(matchModels(catalog, 'Anthropic').map(entry => entry.id)).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('returns an opening set for an empty query, and honours the limit', () => {
    expect(matchModels(catalog, '')).toHaveLength(3);
    expect(matchModels(catalog, '', 2)).toHaveLength(2);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(matchModels(catalog, 'zzzz')).toEqual([]);
  });
});

describe('countUsable', () => {
  it('counts only the models an agent could actually drive', () => {
    expect(
      countUsable([
        model('a/one'),
        model('a/two:batch'),
        model('a/three', { supportedParameters: [] }),
        model('a/four'),
      ]),
    ).toBe(2);
  });
});

describe('normalizeCatalog', () => {
  it('reads the fields the picker shows', () => {
    const [entry] = normalizeCatalog({
      data: [payloadEntry('vendor/model', { architecture: { input_modalities: ['text', 'image'] } })],
    });
    expect(entry).toEqual({
      id: 'vendor/model',
      name: 'Vendor: vendor/model',
      supportedParameters: ['tools', 'temperature'],
      promptPrice: 3e-7,
      contextLength: 128000,
      acceptsImages: true,
    });
  });

  // This parses a third party's response on every load, so one bad row must not cost the rest.
  it('drops malformed entries instead of the whole list', () => {
    const models = normalizeCatalog({ data: [payloadEntry('vendor/good'), null, {}, { id: '' }, 'nonsense'] });
    expect(models.map(entry => entry.id)).toEqual(['vendor/good']);
  });

  it('survives a payload that is not the shape at all', () => {
    expect(normalizeCatalog(null)).toEqual([]);
    expect(normalizeCatalog({ data: 'nope' })).toEqual([]);
  });

  it('falls back to the id when there is no display name, and to null for missing numbers', () => {
    const [entry] = normalizeCatalog({ data: [{ id: 'vendor/bare' }] });
    expect(entry.name).toBe('vendor/bare');
    expect(entry.promptPrice).toBeNull();
    expect(entry.contextLength).toBeNull();
    expect(entry.supportedParameters).toEqual([]);
  });
});

describe('formatting', () => {
  it('shortens the context window instead of printing seven digits', () => {
    expect(formatContextLength(1048576)).toBe('1M');
    expect(formatContextLength(128000)).toBe('128K');
    expect(formatContextLength(900)).toBe('900');
    expect(formatContextLength(null)).toBeNull();
    expect(formatContextLength(0)).toBeNull();
  });

  it('quotes per million tokens, with the trailing zeros gone', () => {
    expect(formatPromptPrice(3e-7)).toBe('$0.3');
    expect(formatPromptPrice(2.5e-6)).toBe('$2.5');
    expect(formatPromptPrice(1.5e-8)).toBe('$0.015');
  });

  // "$0" reads like a value that failed to load; the caller has a word for free that does not.
  it('gives no price for a free or unpriced model', () => {
    expect(formatPromptPrice(0)).toBeNull();
    expect(formatPromptPrice(null)).toBeNull();
  });
});

describe('loadOpenRouterCatalog', () => {
  const payload = { data: [payloadEntry('vendor/model')] };

  it('fetches and caches when there is nothing stored', async () => {
    const storage = fakeStorage();
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const models = await loadOpenRouterCatalog({ storage, fetchImpl, now: () => 1000 });

    expect(models.map(entry => entry.id)).toEqual(['vendor/model']);
    expect(storage.data.openrouterCatalogCache).toEqual({ fetchedAt: 1000, models });
  });

  it('serves a fresh cache without touching the network', async () => {
    const cached = [model('vendor/cached')];
    const storage = fakeStorage({ openrouterCatalogCache: { fetchedAt: 1000, models: cached } });
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const models = await loadOpenRouterCatalog({ storage, fetchImpl, now: () => 1000 + 60_000 });

    expect(models).toEqual(cached);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refetches once the cache is a day old', async () => {
    const storage = fakeStorage({ openrouterCatalogCache: { fetchedAt: 0, models: [model('vendor/stale')] } });
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const models = await loadOpenRouterCatalog({ storage, fetchImpl, now: () => 25 * 60 * 60 * 1000 });

    expect(models.map(entry => entry.id)).toEqual(['vendor/model']);
  });

  // A picker that empties itself the moment the network hiccups is worse than one a day behind.
  it('falls back to a stale cache when the refetch fails', async () => {
    const stale = [model('vendor/stale')];
    const storage = fakeStorage({ openrouterCatalogCache: { fetchedAt: 0, models: stale } });
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(loadOpenRouterCatalog({ storage, fetchImpl, now: () => 25 * 60 * 60 * 1000 })).resolves.toEqual(stale);
  });

  it('throws only when there is no cache to fall back on', async () => {
    const storage = fakeStorage();
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));

    await expect(loadOpenRouterCatalog({ storage, fetchImpl, now: () => 0 })).rejects.toThrow('503');
  });

  // An empty list would be cached for a day and would look exactly like "OpenRouter has no models".
  it('treats an empty response as a failure rather than caching it', async () => {
    const storage = fakeStorage();
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));

    await expect(loadOpenRouterCatalog({ storage, fetchImpl, now: () => 0 })).rejects.toThrow('empty');
    expect(storage.data.openrouterCatalogCache).toBeUndefined();
  });

  it('ignores a cache entry that is not the shape it should be', async () => {
    const storage = fakeStorage({ openrouterCatalogCache: { fetchedAt: 'yesterday' } });
    const fetchImpl = vi.fn(async () => jsonResponse(payload));

    const models = await loadOpenRouterCatalog({ storage, fetchImpl, now: () => 0 });

    expect(models.map(entry => entry.id)).toEqual(['vendor/model']);
  });
});
