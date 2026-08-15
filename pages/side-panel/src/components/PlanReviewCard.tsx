/* eslint-disable react/prop-types */
import { FaCheck, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { t } from '@extension/i18n';
import type { PlanReviewPayload } from '../types/event';

interface PlanReviewCardProps {
  plan: PlanReviewPayload;
  onApprove: () => void;
  onReject: () => void;
  /** Estimated spend so far (planning is already paid for), from the user's own price entries. */
  spentUsd?: number | null;
  /** True when unpriced models also spent tokens, making spentUsd a floor. */
  spentIsFloor?: boolean;
  /** The user's per-task budget; 0 or absent means none is set. */
  budgetUsd?: number;
}

/** Small dollar amounts need more precision than a whole-cent format can show. */
const usd = (value: number): string => `$${value.toFixed(value < 0.1 ? 4 : 2)}`;

/**
 * Blocking review card shown before the agent is allowed to act. The agent is parked on a promise
 * in the background until one of these buttons is pressed, so this is the user's real veto point.
 * Every section is rendered verbatim: the user must approve the planner's own words, not a rewrite.
 */
const PlanReviewCard: React.FC<PlanReviewCardProps> = ({
  plan,
  onApprove,
  onReject,
  spentUsd,
  spentIsFloor,
  budgetUsd,
}) => {
  const sections: Array<{ label: string; value: string; well?: boolean }> = [
    { label: t('planReview_steps'), value: plan.nextSteps, well: true },
    { label: t('planReview_observation'), value: plan.observation },
    { label: t('planReview_reasoning'), value: plan.reasoning },
  ];

  return (
    <div className="mx-3 my-2 animate-rise rounded-slab bg-canvas-raised p-4 shadow-neu-lg">
      <h3 className="text-sm font-semibold text-ink">{t('planReview_title')}</h3>

      {sections
        .filter(section => section.value?.trim())
        .map(section => (
          <div key={section.label} className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{section.label}</div>
            <p
              className={
                section.well
                  ? 'whitespace-pre-wrap break-words rounded-soft bg-canvas-sunk p-3 text-sm text-ink shadow-neu-inset'
                  : 'whitespace-pre-wrap break-words text-sm text-ink-soft'
              }>
              {section.value}
            </p>
          </div>
        ))}

      {plan.challenges?.trim() && (
        <div
          className="mt-3 flex gap-2.5 rounded-soft bg-canvas-sunk p-3 shadow-neu-inset"
          data-testid="plan-review-challenges">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-signal-warn" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint">{t('planReview_challenges')}</div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{plan.challenges}</p>
          </div>
        </div>
      )}

      {/* What approval costs: planning is already spent; the budget is the leash on what follows. */}
      {typeof spentUsd === 'number' && (budgetUsd ?? 0) > 0 && (
        <p className="mt-3 text-[11px] text-ink-faint" data-testid="plan-review-budget">
          {t('planReview_budget', [`${spentIsFloor ? '≥ ' : '≈ '}${usd(spentUsd)}`, usd(budgetUsd ?? 0)])}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-soft bg-graphite px-3 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed">
          <FaCheck size={12} />
          {t('planReview_approve')}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="flex items-center justify-center gap-1.5 rounded-soft bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
          <FaTimes size={12} />
          {t('planReview_reject')}
        </button>
      </div>
    </div>
  );
};

export default PlanReviewCard;
