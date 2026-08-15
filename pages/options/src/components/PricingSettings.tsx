import { useState, useEffect, useCallback } from 'react';
import { agentModelStore, modelPricingStore } from '@extension/storage';
import { t } from '@extension/i18n';
import type { ModelPricingConfig } from '@extension/storage';

/** Same milled-in field as the number inputs above, sized for a price. */
const priceFieldClass =
  'w-24 rounded-soft bg-canvas-sunk px-2.5 py-1.5 text-right text-sm text-ink shadow-neu-inset placeholder:text-ink-faint';

/** One editable row of drafts; strings, so half-typed decimals survive re-renders. */
interface PriceDraft {
  input: string;
  output: string;
}

/**
 * The price list behind every $ readout and the budget brake: USD per 1M tokens, entered by the
 * user for the models they actually use. Entered, never shipped — see modelPricing.ts for why a
 * built-in table is refused on principle.
 *
 * Rows appear for every model currently assigned to an agent, plus any model that already has a
 * price (so unassigning a model does not orphan its entry invisibly). Both fields cleared removes
 * the entry, returning that model to "unpriced".
 */
export const PricingSettings = () => {
  const [assignedModels, setAssignedModels] = useState<string[]>([]);
  const [prices, setPrices] = useState<ModelPricingConfig>({});
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});

  useEffect(() => {
    const loadAssigned = () =>
      agentModelStore
        .getAllAgentModels()
        .then(records => {
          const names = Object.values(records)
            .map(record => record?.modelName)
            .filter((name): name is string => typeof name === 'string' && name.length > 0);
          setAssignedModels([...new Set(names)]);
        })
        .catch(console.error);
    const loadPrices = () => modelPricingStore.getAllPrices().then(setPrices).catch(console.error);

    loadAssigned();
    loadPrices();
    const unsubscribeModels = agentModelStore.subscribe(loadAssigned);
    const unsubscribePrices = modelPricingStore.subscribe(loadPrices);
    return () => {
      unsubscribeModels();
      unsubscribePrices();
    };
  }, []);

  const models = [...new Set([...assignedModels, ...Object.keys(prices)])].sort();

  const draftFor = (model: string): PriceDraft => {
    const existing = drafts[model];
    if (existing) return existing;
    const price = prices[model];
    return {
      input: price ? String(price.inputPerMTok) : '',
      output: price ? String(price.outputPerMTok) : '',
    };
  };

  const setDraft = (model: string, patch: Partial<PriceDraft>) => {
    setDrafts(prev => ({ ...prev, [model]: { ...draftFor(model), ...patch } }));
  };

  /** Commit a row: both fields valid saves, both fields empty deletes, anything else stays a draft. */
  const commit = useCallback(async (model: string, draft: PriceDraft) => {
    const inputText = draft.input.trim();
    const outputText = draft.output.trim();
    if (inputText === '' && outputText === '') {
      await modelPricingStore.setPrice(model, null).catch(console.error);
      return;
    }
    const inputPerMTok = Number.parseFloat(inputText);
    const outputPerMTok = Number.parseFloat(outputText);
    if (Number.isFinite(inputPerMTok) && inputPerMTok >= 0 && Number.isFinite(outputPerMTok) && outputPerMTok >= 0) {
      await modelPricingStore.setPrice(model, { inputPerMTok, outputPerMTok }).catch(console.error);
    }
  }, []);

  return (
    <div className="py-4">
      <h3 className="text-sm font-semibold tracking-tight text-ink">{t('options_pricing_header')}</h3>
      <p className="mt-0.5 text-sm font-normal text-ink-soft">{t('options_pricing_desc')}</p>

      {models.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">{t('options_pricing_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {models.map(model => {
            const draft = draftFor(model);
            return (
              <li key={model} className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs text-ink">{model}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <label className="text-[11px] uppercase tracking-wide text-ink-faint" htmlFor={`price-in-${model}`}>
                    {t('options_pricing_input')}
                  </label>
                  <input
                    id={`price-in-${model}`}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="—"
                    value={draft.input}
                    onChange={e => setDraft(model, { input: e.target.value })}
                    onBlur={() => void commit(model, draftFor(model))}
                    className={priceFieldClass}
                  />
                  <label className="text-[11px] uppercase tracking-wide text-ink-faint" htmlFor={`price-out-${model}`}>
                    {t('options_pricing_output')}
                  </label>
                  <input
                    id={`price-out-${model}`}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="—"
                    value={draft.output}
                    onChange={e => setDraft(model, { output: e.target.value })}
                    onBlur={() => void commit(model, draftFor(model))}
                    className={priceFieldClass}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
