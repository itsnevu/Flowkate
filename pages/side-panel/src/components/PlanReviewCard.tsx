/* eslint-disable react/prop-types */
import { FaCheck, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { t } from '@extension/i18n';
import type { PlanReviewPayload } from '../types/event';

interface PlanReviewCardProps {
  plan: PlanReviewPayload;
  onApprove: () => void;
  onReject: () => void;
  isDarkMode?: boolean;
}

/**
 * Blocking review card shown before the agent is allowed to act. The agent is parked on a promise
 * in the background until one of these buttons is pressed, so this is the user's real veto point.
 */
const PlanReviewCard: React.FC<PlanReviewCardProps> = ({ plan, onApprove, onReject, isDarkMode = false }) => {
  const sections: Array<{ label: string; value: string }> = [
    { label: t('planReview_steps'), value: plan.nextSteps },
    { label: t('planReview_observation'), value: plan.observation },
    { label: t('planReview_reasoning'), value: plan.reasoning },
  ];

  return (
    <div
      className={`mx-4 my-2 rounded-lg border p-3 ${
        isDarkMode ? 'border-sky-700 bg-slate-800' : 'border-sky-300 bg-sky-50'
      }`}>
      <h3 className={`mb-2 text-sm font-semibold ${isDarkMode ? 'text-sky-300' : 'text-sky-800'}`}>
        {t('planReview_title')}
      </h3>

      {sections
        .filter(section => section.value?.trim())
        .map(section => (
          <div key={section.label} className="mb-2">
            <div className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {section.label}
            </div>
            <p className={`whitespace-pre-wrap text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              {section.value}
            </p>
          </div>
        ))}

      {plan.challenges?.trim() && (
        <div
          className={`mb-2 flex gap-2 rounded p-2 ${isDarkMode ? 'bg-amber-900/40' : 'bg-amber-100'}`}
          data-testid="plan-review-challenges">
          <FaExclamationTriangle className={`mt-0.5 shrink-0 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
          <div>
            <div className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
              {t('planReview_challenges')}
            </div>
            <p className={`whitespace-pre-wrap text-sm ${isDarkMode ? 'text-amber-100' : 'text-amber-900'}`}>
              {plan.challenges}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
          <FaCheck size={12} />
          {t('planReview_approve')}
        </button>
        <button
          type="button"
          onClick={onReject}
          className={`flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
            isDarkMode
              ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}>
          <FaTimes size={12} />
          {t('planReview_reject')}
        </button>
      </div>
    </div>
  );
};

export default PlanReviewCard;
