import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

/**
 * Prices the user entered for the models they use, in USD per one million tokens.
 *
 * Entered, never shipped: a hardcoded price table would be stale the day it shipped, and this
 * extension talks to OpenRouter, custom endpoints and local Ollama, where no table could be right
 * at all (see the same argument in the side panel's TokenUsageBar). A model without an entry here
 * simply has no price, and everything downstream treats its cost as unknown rather than zero.
 */
export interface ModelPrice {
  /** USD per 1M input (prompt) tokens. Cached reads are billed at this same rate, which makes every estimate a ceiling, not a guess below the truth. */
  inputPerMTok: number;
  /** USD per 1M output (completion) tokens. */
  outputPerMTok: number;
}

/** Keyed by the model name exactly as the provider reports it in usage metadata. */
export type ModelPricingConfig = Record<string, ModelPrice>;

export type ModelPricingStorage = BaseStorage<ModelPricingConfig> & {
  /** Set a model's price, or remove it entirely with `null`. */
  setPrice: (model: string, price: ModelPrice | null) => Promise<void>;
  getAllPrices: () => Promise<ModelPricingConfig>;
};

const storage = createStorage<ModelPricingConfig>(
  'model-pricing',
  {},
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const modelPricingStore: ModelPricingStorage = {
  ...storage,
  async setPrice(model: string, price: ModelPrice | null) {
    await storage.set(prev => {
      const next = { ...prev };
      if (price === null) {
        delete next[model];
      } else {
        next[model] = price;
      }
      return next;
    });
  },
  getAllPrices: () => storage.get(),
};

/** The fields of a usage entry that pricing needs; structural so any payload shape qualifies. */
export interface PricedUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostEstimate {
  /** Summed cost of every entry whose model has a valid price. */
  usd: number;
  /** Models that spent tokens but have no (valid) price entered. Non-empty means `usd` is a floor. */
  unpricedModels: string[];
}

const isValidPrice = (price: ModelPrice | undefined): price is ModelPrice =>
  !!price &&
  Number.isFinite(price.inputPerMTok) &&
  Number.isFinite(price.outputPerMTok) &&
  price.inputPerMTok >= 0 &&
  price.outputPerMTok >= 0;

/**
 * What the given usage cost, according to the user's own price entries.
 *
 * Unknown models are reported, not guessed at: a budget brake that silently priced them at zero
 * would claim a task was cheap while an expensive unpriced model burned underneath it.
 */
export function estimateCostUsd(entries: PricedUsageEntry[], prices: ModelPricingConfig): CostEstimate {
  let usd = 0;
  const unpriced = new Set<string>();
  for (const entry of entries) {
    const price = prices[entry.model];
    if (!isValidPrice(price)) {
      unpriced.add(entry.model);
      continue;
    }
    usd += (entry.inputTokens * price.inputPerMTok + entry.outputTokens * price.outputPerMTok) / 1_000_000;
  }
  return { usd, unpricedModels: [...unpriced] };
}
