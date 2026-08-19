/**
 * OpenRouter's public model catalogue, and what Flowkite can actually do with each entry.
 *
 * Fetched rather than checked in: OpenRouter carries a few hundred models and the roster moves
 * every week, so any table stored in this repo would be wrong within a month - and a stale table
 * would block the good models that shipped after it. The endpoint takes no API key, which is what
 * lets the picker work before the user has pasted one.
 */

/** The fields of a catalogue entry this pane reads. Everything else in the payload is ignored. */
export interface OpenRouterModel {
  id: string;
  /** OpenRouter's display name, e.g. "Google: Gemini 2.5 Flash". */
  name: string;
  /** Request parameters the endpoint accepts. Empty when the payload carried none. */
  supportedParameters: string[];
  /** USD per prompt token, or null when OpenRouter quoted no price. */
  promptPrice: number | null;
  contextLength: number | null;
  acceptsImages: boolean;
}

/** Whether Flowkite's agents can drive a model, and when they cannot, why. */
export type ModelVerdict = 'ok' | 'batchOnly' | 'noStructuredOutput' | 'unknown';

/**
 * The suffix OpenRouter puts on a model's batch-only variant.
 *
 * These are around a seventh of the catalogue and answer an ordinary chat completion with a 404
 * pointing at /api/beta/batches. Flowkite drives a live browser one step at a time, so a batch
 * endpoint is not something it could ever use: the variant is the wrong product, not a setting.
 */
const BATCH_SUFFIX = ':batch';

/** Any one of these is enough for the agents' structured output to work. */
const STRUCTURED_OUTPUT_PARAMS = ['tools', 'response_format', 'structured_outputs'];

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_KEY = 'openrouterCatalogCache';

/** A day. The roster moves weekly at most, and a stale entry costs only a missing suggestion. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedCatalog {
  fetchedAt: number;
  models: OpenRouterModel[];
}

/**
 * The slice of `chrome.storage.local` this module uses.
 *
 * The catalogue is cached there rather than through `@extension/storage` because it is a copy of
 * someone else's data, not a user setting: it must not travel with the settings the user exports,
 * and it can be thrown away at any time without losing anything they chose.
 */
export interface CatalogStorage {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

export interface CatalogDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  storage?: CatalogStorage;
}

export function isBatchVariant(modelId: string): boolean {
  return modelId.endsWith(BATCH_SUFFIX);
}

/** The ordinary model a batch variant was cut from, which is the one the user meant to pick. */
export function baseModelId(modelId: string): string {
  return isBatchVariant(modelId) ? modelId.slice(0, -BATCH_SUFFIX.length) : modelId;
}

export function classifyModel(model: OpenRouterModel): ModelVerdict {
  if (isBatchVariant(model.id)) return 'batchOnly';
  return model.supportedParameters.some(parameter => STRUCTURED_OUTPUT_PARAMS.includes(parameter))
    ? 'ok'
    : 'noStructuredOutput';
}

/**
 * The verdict for a model id the user typed, or saved on an earlier visit.
 *
 * The batch check runs before the catalogue lookup so it still answers when the fetch failed: it
 * is a rule about the id itself, not a fact that had to be downloaded. Anything the catalogue does
 * not recognise stays 'unknown' rather than being called broken - a stale cache or a model that
 * shipped this morning must never be reported to the user as their mistake.
 */
export function verdictForId(catalog: OpenRouterModel[] | null, modelId: string): ModelVerdict {
  if (isBatchVariant(modelId)) return 'batchOnly';
  if (!catalog) return 'unknown';
  const found = catalog.find(model => model.id === modelId);
  return found ? classifyModel(found) : 'unknown';
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Read the payload defensively: one malformed entry drops itself rather than the whole catalogue.
 *
 * This parses a third party's response on every load, so it assumes nothing about shape beyond the
 * id, which is the only field the rest of the pane cannot do without.
 */
export function normalizeCatalog(payload: unknown): OpenRouterModel[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];

  const models: OpenRouterModel[] = [];
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.id.length === 0) continue;

    const architecture = (record.architecture ?? {}) as Record<string, unknown>;
    const pricing = (record.pricing ?? {}) as Record<string, unknown>;
    models.push({
      id: record.id,
      name: typeof record.name === 'string' ? record.name : record.id,
      supportedParameters: toStringArray(record.supported_parameters),
      promptPrice: toFiniteNumber(pricing.prompt),
      contextLength: toFiniteNumber(record.context_length),
      acceptsImages: toStringArray(architecture.input_modalities).includes('image'),
    });
  }
  return models;
}

/**
 * Suggestions for what the user has typed so far, best match first.
 *
 * Batch variants are never suggested. There are dozens of them, not one can be used here, and
 * offering a row that only ever ends in a failed task is worse than not listing it at all. Someone
 * who pastes one anyway is answered by the warning above the list, which names the ordinary model
 * to use in its place - a dead end is a bad answer, a redirection is a good one.
 *
 * Terms are matched independently so "gemini flash" finds `google/gemini-2.5-flash`, which is how
 * people actually remember a model they saw once.
 */
export function matchModels(catalog: OpenRouterModel[], query: string, limit = 8): OpenRouterModel[] {
  const needle = query.trim().toLowerCase();
  const usable = catalog.filter(model => !isBatchVariant(model.id));
  if (!needle) return usable.slice(0, limit);

  const terms = needle.split(/\s+/);
  const scored: Array<{ model: OpenRouterModel; score: number }> = [];
  for (const model of usable) {
    const id = model.id.toLowerCase();
    const name = model.name.toLowerCase();
    if (!terms.every(term => id.includes(term) || name.includes(term))) continue;

    // Exact first, then a prefix, then anything containing the phrase, then the scattered-term hit.
    let score = 3;
    if (id.includes(needle) || name.includes(needle)) score = 2;
    if (id.startsWith(needle)) score = 1;
    if (id === needle) score = 0;
    scored.push({ model, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      // The plain model before its dated previews and -lite spin-offs, which are always longer.
      a.model.id.length - b.model.id.length ||
      a.model.id.localeCompare(b.model.id),
  );
  return scored.slice(0, limit).map(entry => entry.model);
}

/** How many of the catalogue's models the agents can actually drive. */
export function countUsable(catalog: OpenRouterModel[]): number {
  return catalog.filter(model => classifyModel(model) === 'ok').length;
}

/** "1M", "128K" - the context window at a glance rather than seven digits of noise. */
export function formatContextLength(tokens: number | null): string | null {
  if (tokens === null || tokens <= 0) return null;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * USD per million prompt tokens, the unit OpenRouter's own pricing page uses.
 *
 * Returns null for a free model as well as an unpriced one: "$0" reads like a missing value, and
 * the caller has a word for free that says it properly.
 */
export function formatPromptPrice(pricePerToken: number | null): string | null {
  if (pricePerToken === null || pricePerToken <= 0) return null;
  const perMillion = pricePerToken * 1_000_000;
  // Trailing zeros stripped by the round trip: $0.3 rather than $0.300, $2.5 rather than $2.50.
  return `$${Number(perMillion.toFixed(perMillion < 1 ? 3 : 2))}`;
}

async function readCache(storage: CatalogStorage): Promise<CachedCatalog | null> {
  try {
    const stored = await storage.get([CACHE_KEY]);
    const entry = stored?.[CACHE_KEY] as CachedCatalog | undefined;
    if (!entry || typeof entry.fetchedAt !== 'number' || !Array.isArray(entry.models)) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * The catalogue, from cache when it is fresh and from OpenRouter otherwise.
 *
 * A failed refresh falls back to whatever was cached instead of throwing: every id in a day-old
 * list is still a real model, and a picker that goes blank the moment the network hiccups is worse
 * than one showing yesterday's roster. Only a first run with no cache at all can fail, and the
 * caller answers that by letting the user type the id by hand.
 */
export async function loadOpenRouterCatalog(deps: CatalogDeps = {}): Promise<OpenRouterModel[]> {
  const now = deps.now ?? (() => Date.now());
  const storage = deps.storage ?? (chrome.storage.local as unknown as CatalogStorage);
  const fetchImpl = deps.fetchImpl ?? fetch;

  const cached = await readCache(storage);
  if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) return cached.models;

  try {
    const response = await fetchImpl(CATALOG_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`OpenRouter model list request failed with ${response.status}`);
    const models = normalizeCatalog(await response.json());
    if (models.length === 0) throw new Error('OpenRouter model list came back empty');
    await storage.set({ [CACHE_KEY]: { fetchedAt: now(), models } satisfies CachedCatalog });
    return models;
  } catch (error) {
    if (cached) return cached.models;
    throw error;
  }
}
