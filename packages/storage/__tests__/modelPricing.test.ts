import { describe, it, expect, beforeEach } from 'vitest';
import { modelPricingStore, estimateCostUsd } from '../lib/settings/modelPricing';
import type { ModelPricingConfig } from '../lib/settings/modelPricing';

/**
 * The cost estimate feeds a brake that pauses real tasks and a $ readout the user trusts, so its
 * two honesty rules are pinned here: an unpriced model is "unknown", never zero — and a garbage
 * price entry (negative, NaN) demotes its model back to unpriced rather than poisoning the sum.
 */
describe('estimateCostUsd', () => {
  const prices: ModelPricingConfig = {
    'gpt-cheap': { inputPerMTok: 0.5, outputPerMTok: 2 },
    'claude-good': { inputPerMTok: 3, outputPerMTok: 15 },
  };

  it('prices a single fully-known entry', () => {
    const { usd, unpricedModels } = estimateCostUsd(
      [{ model: 'gpt-cheap', inputTokens: 1_000_000, outputTokens: 500_000 }],
      prices,
    );
    expect(usd).toBeCloseTo(0.5 + 1.0, 10);
    expect(unpricedModels).toEqual([]);
  });

  it('sums across models and reports the unpriced one instead of pricing it at zero', () => {
    const { usd, unpricedModels } = estimateCostUsd(
      [
        { model: 'claude-good', inputTokens: 100_000, outputTokens: 10_000 },
        { model: 'ollama-local', inputTokens: 2_000_000, outputTokens: 900_000 },
      ],
      prices,
    );
    expect(usd).toBeCloseTo(0.3 + 0.15, 10);
    expect(unpricedModels).toEqual(['ollama-local']);
  });

  it('treats an invalid price entry as unpriced', () => {
    const bad: ModelPricingConfig = {
      negative: { inputPerMTok: -1, outputPerMTok: 2 },
      nan: { inputPerMTok: Number.NaN, outputPerMTok: 2 },
    };
    const { usd, unpricedModels } = estimateCostUsd(
      [
        { model: 'negative', inputTokens: 1000, outputTokens: 1000 },
        { model: 'nan', inputTokens: 1000, outputTokens: 1000 },
      ],
      bad,
    );
    expect(usd).toBe(0);
    expect(unpricedModels).toEqual(['negative', 'nan']);
  });

  it('returns zero-and-empty for no usage at all', () => {
    expect(estimateCostUsd([], prices)).toEqual({ usd: 0, unpricedModels: [] });
  });

  it('deduplicates an unpriced model that appears in several entries', () => {
    const { unpricedModels } = estimateCostUsd(
      [
        { model: 'mystery', inputTokens: 1, outputTokens: 1 },
        { model: 'mystery', inputTokens: 2, outputTokens: 2 },
      ],
      {},
    );
    expect(unpricedModels).toEqual(['mystery']);
  });
});

describe('modelPricingStore', () => {
  beforeEach(async () => {
    await chrome.storage.local.remove('model-pricing');
  });

  it('stores and returns a price', async () => {
    await modelPricingStore.setPrice('gpt-cheap', { inputPerMTok: 0.5, outputPerMTok: 2 });
    expect(await modelPricingStore.getAllPrices()).toEqual({
      'gpt-cheap': { inputPerMTok: 0.5, outputPerMTok: 2 },
    });
  });

  it('removes a price when set to null', async () => {
    await modelPricingStore.setPrice('gpt-cheap', { inputPerMTok: 0.5, outputPerMTok: 2 });
    await modelPricingStore.setPrice('gpt-cheap', null);
    expect(await modelPricingStore.getAllPrices()).toEqual({});
  });

  it('keeps other models untouched when one is edited', async () => {
    await modelPricingStore.setPrice('a', { inputPerMTok: 1, outputPerMTok: 2 });
    await modelPricingStore.setPrice('b', { inputPerMTok: 3, outputPerMTok: 4 });
    await modelPricingStore.setPrice('a', null);
    expect(await modelPricingStore.getAllPrices()).toEqual({ b: { inputPerMTok: 3, outputPerMTok: 4 } });
  });
});
