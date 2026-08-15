/* eslint-disable react/prop-types */
import { FaCoins, FaCheck, FaTimes } from 'react-icons/fa';
import { t } from '@extension/i18n';
import type { BudgetPausePayload } from '../types/event';

interface BudgetPauseCardProps {
  pause: BudgetPausePayload;
  onContinue: () => void;
  onStop: () => void;
}

/** Small dollar amounts need more precision than a whole-cent format can show. */
const usd = (value: number): string => `$${value.toFixed(value < 0.1 ? 4 : 2)}`;

/**
 * Blocking decision card raised when the task's estimated spend crossed the user's budget. The
 * executor is parked in its pause-wait until the panel answers with resume_task or cancel_task,
 * so continuing is a real decision, not an acknowledgement — and it releases the brake for the
 * rest of this task, which the card says out loud.
 */
const BudgetPauseCard: React.FC<BudgetPauseCardProps> = ({ pause, onContinue, onStop }) => (
  <div className="mx-3 my-2 flex animate-rise overflow-hidden rounded-slab bg-canvas-raised shadow-neu-lg">
    {/* Warning rail — same treatment as the sensitive-action card: this is also a gate. */}
    <div className="w-1.5 shrink-0 bg-signal-warn" aria-hidden="true" />

    <div className="min-w-0 flex-1 p-4">
      <div className="flex items-center gap-2">
        <FaCoins className="shrink-0 text-signal-warn" />
        <h3 className="text-sm font-semibold text-ink">{t('budgetPause_title')}</h3>
      </div>

      <div className="mt-3 rounded-soft bg-canvas-sunk p-3 shadow-neu-inset">
        <p className="text-sm font-medium text-ink">
          {t('budgetPause_body', [usd(pause.spentUsd), usd(pause.budgetUsd)])}
        </p>
        {pause.unpricedModels.length > 0 && (
          <p className="mt-1.5 break-words text-xs text-ink-soft">
            {t('budgetPause_unpriced', [pause.unpricedModels.join(', ')])}
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">{t('budgetPause_note')}</p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onStop}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-soft bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
          <FaTimes size={12} />
          {t('budgetPause_stop')}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-soft bg-graphite px-3 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed">
          <FaCheck size={12} />
          {t('budgetPause_continue')}
        </button>
      </div>
    </div>
  </div>
);

export default BudgetPauseCard;
