import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@extension/i18n';
import {
  baseModelId,
  countUsable,
  formatContextLength,
  formatPromptPrice,
  matchModels,
  verdictForId,
} from './openRouterCatalog';
import { useOpenRouterCatalog } from './useOpenRouterCatalog';
import {
  CHIP,
  CHIP_REMOVE,
  FIELD_HINT,
  FIELD_LABEL,
  LISTBOX,
  LISTBOX_EMPTY,
  LISTBOX_OPTION,
  LISTBOX_OPTION_ACTIVE,
  NOTICE_TEXT,
  NOTICE_WELL,
  TAG_INPUT,
  TAG_WELL,
} from './styles';
import type { FocusEvent, KeyboardEvent } from 'react';
import type { ModelVerdict, OpenRouterModel } from './openRouterCatalog';

interface OpenRouterModelFieldProps {
  providerId: string;
  /** Model ids already on this provider. */
  selected: string[];
  /** The pending search text, held by the parent alongside every other provider's. */
  query: string;
  onQueryChange: (value: string) => void;
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
}

const SUGGESTION_LIMIT = 8;

const CROSS_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-3"
    aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** One line of small print under a model id: what it costs, how much it holds, what it reads. */
function modelMeta(model: OpenRouterModel): string {
  const parts = [model.name];
  const context = formatContextLength(model.contextLength);
  if (context) parts.push(t('options_models_providers_openrouter_context', [context]));
  const price = formatPromptPrice(model.promptPrice);
  if (price) parts.push(t('options_models_providers_openrouter_perMillion', [price]));
  else if (model.promptPrice === 0) parts.push(t('options_models_providers_openrouter_free'));
  if (model.acceptsImages) parts.push(t('options_models_providers_openrouter_vision'));
  return parts.join(' · ');
}

/** The plain-language reason a model will not work, or null when it will. */
function verdictMessage(verdict: ModelVerdict): string | null {
  if (verdict === 'batchOnly') return t('options_models_providers_openrouter_batchWarning');
  if (verdict === 'noStructuredOutput') return t('options_models_providers_openrouter_unsupportedWarning');
  return null;
}

/**
 * The model field for OpenRouter, which is a search over its catalogue rather than a blank box.
 *
 * OpenRouter is the one provider where the user is expected to know an exact id out of several
 * hundred, and roughly a fifth of those ids cannot drive an agent at all - the batch-only variants
 * answer with a 404, and a handful of models support neither tool calling nor JSON schema. Typing
 * one of those by hand used to produce nothing but "max failures reached" three steps later, with
 * no way to connect that to the choice made here. So the field says up front what each model is,
 * and refuses nothing: anything can still be added by pressing Enter, warning and all, because the
 * catalogue can be stale and the user may know something it does not.
 */
export const OpenRouterModelField = ({
  providerId,
  selected,
  query,
  onQueryChange,
  onAdd,
  onRemove,
}: OpenRouterModelFieldProps) => {
  const { models, status } = useOpenRouterCatalog();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The blur close is deferred, so it has to be cancelled if the card goes away while it is pending.
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const inputId = `${providerId}-models-input`;
  const listboxId = `${providerId}-models-listbox`;
  const trimmedQuery = query.trim();

  const suggestions = useMemo(() => {
    if (!models) return [];
    return matchModels(models, query, SUGGESTION_LIMIT).filter(model => !selected.includes(model.id));
  }, [models, query, selected]);

  // What the user has typed, judged on its own. Separate from the suggestions because a pasted
  // batch id never appears among them - being told why is the whole point of the pasting case.
  const typedVerdict = trimmedQuery ? verdictForId(models, trimmedQuery) : 'unknown';
  const typedWarning = trimmedQuery ? verdictMessage(typedVerdict) : null;
  const batchAlternative =
    typedVerdict === 'batchOnly' && !selected.includes(baseModelId(trimmedQuery)) ? baseModelId(trimmedQuery) : null;

  const commit = (modelId: string) => {
    const value = modelId.trim();
    if (!value || selected.includes(value)) return;
    onAdd(value);
    setActiveIndex(0);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      if (suggestions.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(current => (current + step + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // The highlighted suggestion when the list is showing one, otherwise exactly what was typed:
      // an id the catalogue has never heard of is still allowed through.
      const highlighted = isOpen ? suggestions[activeIndex] : undefined;
      commit(highlighted?.id ?? trimmedQuery);
      if (highlighted || trimmedQuery) onQueryChange('');
      return;
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    // An empty field with a Backspace takes back the last chip, as every tag input does.
    if (event.key === 'Backspace' && query === '' && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    // Focus landing on another real control means the user has left, so the list goes at once. The
    // card drops out of `focus-within` on the same tick, and a deferred close would leave the list
    // painted underneath the Add New Provider key for those few frames.
    if (event.relatedTarget) {
      setIsOpen(false);
      return;
    }
    // Nothing took focus - a click on the list itself or a drag of its scrollbar. Deferred, so the
    // option's own mouse-down still runs before the list disappears from under the pointer.
    blurTimer.current = setTimeout(() => setIsOpen(false), 120);
  };

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setIsOpen(true);
  };

  const hint = (() => {
    if (status === 'loading') return t('options_models_providers_openrouter_loading');
    if (status === 'unavailable') return t('options_models_providers_openrouter_unavailable');
    return t('options_models_providers_openrouter_ready', [String(countUsable(models ?? []))]);
  })();

  return (
    <div>
      <label htmlFor={inputId} className={FIELD_LABEL}>
        {t('options_models_providers_models')}
      </label>

      <div className="relative">
        <div className={TAG_WELL}>
          {selected.map(model => {
            const verdict = verdictForId(models, model);
            const warning = verdictMessage(verdict);
            return (
              <span key={model} className={CHIP} title={warning ?? undefined}>
                {warning && (
                  <span className="size-1.5 shrink-0 rounded-pill bg-signal-warn" aria-hidden="true">
                    {' '}
                  </span>
                )}
                {model}
                <button
                  type="button"
                  onClick={() => onRemove(model)}
                  className={CHIP_REMOVE}
                  aria-label={`Remove ${model}`}>
                  {CROSS_ICON}
                </button>
              </span>
            );
          })}
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={isOpen && suggestions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
            autoComplete="off"
            placeholder={t('options_models_providers_openrouter_search')}
            value={query}
            onChange={event => {
              onQueryChange(event.target.value);
              setActiveIndex(0);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={TAG_INPUT}
          />
        </div>

        {isOpen && status === 'ready' && (
          <ul id={listboxId} role="listbox" aria-label={t('options_models_providers_models')} className={LISTBOX}>
            {suggestions.length === 0 ? (
              <li className={LISTBOX_EMPTY}>
                {trimmedQuery
                  ? t('options_models_providers_openrouter_noMatch')
                  : t('options_models_providers_openrouter_allAdded')}
              </li>
            ) : (
              suggestions.map((model, index) => (
                <li
                  key={model.id}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${LISTBOX_OPTION} ${index === activeIndex ? LISTBOX_OPTION_ACTIVE : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  // Mouse-down rather than click, so the choice lands before the input's blur.
                  onMouseDown={event => {
                    event.preventDefault();
                    commit(model.id);
                    onQueryChange('');
                  }}>
                  <span className="truncate text-sm font-medium text-ink">{model.id}</span>
                  <span className="truncate text-xs text-ink-faint">{modelMeta(model)}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {typedWarning ? (
        <div className={NOTICE_WELL}>
          <p className={NOTICE_TEXT}>
            <span className="font-medium text-signal-warn">{t('options_models_providers_openrouter_heads_up')}</span>{' '}
            {typedWarning}
          </p>
          {batchAlternative && (
            <button
              type="button"
              onClick={() => {
                commit(batchAlternative);
                onQueryChange('');
              }}
              className="mt-2 inline-flex items-center rounded-pill bg-graphite px-3 py-1 text-xs font-medium text-graphite-50 shadow-key-sm transition-all duration-150 ease-press active:shadow-key-pressed">
              {t('options_models_providers_openrouter_useInstead', [batchAlternative])}
            </button>
          )}
        </div>
      ) : (
        <p className={FIELD_HINT}>{hint}</p>
      )}
    </div>
  );
};
