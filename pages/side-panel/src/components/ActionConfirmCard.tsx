/* eslint-disable react/prop-types */
import { FaShieldAlt, FaCheck, FaTimes } from 'react-icons/fa';
import { t } from '@extension/i18n';
import type { ActionConfirmationPayload } from '../types/event';

interface ActionConfirmCardProps {
  request: ActionConfirmationPayload;
  onConfirm: () => void;
  onDecline: () => void;
  isDarkMode?: boolean;
}

/** Human-readable reason per sensitivity kind, falling back to a generic warning for new kinds. */
const reasonFor = (kind: string): string => {
  switch (kind) {
    case 'purchase':
      return t('actConfirm_reason_purchase');
    case 'destructive':
      return t('actConfirm_reason_destructive');
    case 'download':
      return t('actConfirm_reason_download');
    case 'credentials':
      return t('actConfirm_reason_credentials');
    case 'publish':
      return t('actConfirm_reason_publish');
    default:
      return t('actConfirm_reason_formSubmit');
  }
};

/**
 * Blocking confirmation for an action the agent cannot take on its own. The navigator is parked on a
 * promise until one of these buttons is pressed, so declining genuinely prevents the action.
 */
const ActionConfirmCard: React.FC<ActionConfirmCardProps> = ({ request, onConfirm, onDecline, isDarkMode = false }) => {
  let host = request.url;
  try {
    host = new URL(request.url).host;
  } catch {
    // a non-standard URL (extension page, about:blank) is still worth showing verbatim
  }

  return (
    <div
      className={`mx-4 my-2 rounded-lg border-2 p-3 ${
        isDarkMode ? 'border-amber-600 bg-slate-800' : 'border-amber-400 bg-amber-50'
      }`}>
      <div className="mb-2 flex items-center gap-2">
        <FaShieldAlt className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
        <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
          {t('actConfirm_title')}
        </h3>
      </div>

      <p className={`mb-1 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{reasonFor(request.kind)}</p>
      <p className={`mb-1 text-sm font-medium ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
        {request.description}
      </p>
      {request.target && (
        <p className={`mb-1 truncate text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {t('actConfirm_target')}: {request.target}
        </p>
      )}
      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        {t('actConfirm_onPage')}: {host}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onDecline}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          <FaTimes size={12} />
          {t('actConfirm_decline')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
          <FaCheck size={12} />
          {t('actConfirm_allow')}
        </button>
      </div>
    </div>
  );
};

export default ActionConfirmCard;
