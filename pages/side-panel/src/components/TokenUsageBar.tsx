import { useState } from 'react';
import { t } from '@extension/i18n';
import type { TokenUsagePayload } from '../types/event';

interface TokenUsageBarProps {
  usage: TokenUsagePayload;
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/**
 * What the task cost, in the only unit we can state honestly: tokens the providers themselves
 * reported. No prices - a hardcoded table would be stale the day it shipped, and this extension
 * talks to OpenRouter, custom endpoints and local Ollama, where no table could be right at all.
 */
const TokenUsageBar = ({ usage }: TokenUsageBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const { total, byModel, unreportedCalls } = usage;

  return (
    <div className="shrink-0 px-3 pt-2">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        aria-label={t('chat_usage_details_a11y')}
        className="flex w-full items-center justify-between gap-2 rounded-pill bg-canvas-sunk px-3 py-1.5 text-[11px] text-ink-faint shadow-neu-inset-sm transition-colors duration-150 ease-press hover:text-ink-soft">
        <span className="uppercase tracking-wide">{t('chat_usage_label')}</span>
        <span className="font-mono text-ink-soft">
          {unreportedCalls > 0 ? '≥ ' : ''}
          {compact.format(total.totalTokens)}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 animate-rise rounded-soft bg-canvas-raised p-3 shadow-neu-sm">
          <p className="text-[11px] text-ink-soft">
            {t('chat_usage_inOut', [compact.format(total.inputTokens), compact.format(total.outputTokens)])}
          </p>
          <ul className="mt-2 space-y-1.5">
            {byModel.map(entry => (
              <li key={`${entry.agent}-${entry.model}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-ink">{entry.model}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {t('chat_usage_calls', String(entry.calls))} · {compact.format(entry.totalTokens)}
                </span>
              </li>
            ))}
          </ul>
          {(total.cachedInputTokens > 0 || total.reasoningOutputTokens > 0) && (
            <p className="mt-2 text-[11px] text-ink-faint">
              {total.cachedInputTokens > 0 && t('chat_usage_cached', compact.format(total.cachedInputTokens))}
              {total.cachedInputTokens > 0 && total.reasoningOutputTokens > 0 && ' · '}
              {total.reasoningOutputTokens > 0 &&
                t('chat_usage_reasoning', compact.format(total.reasoningOutputTokens))}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {unreportedCalls > 0 ? `${t('chat_usage_partial')} ` : ''}
            {t('chat_usage_noPrice')}
          </p>
        </div>
      )}
    </div>
  );
};

export default TokenUsageBar;
