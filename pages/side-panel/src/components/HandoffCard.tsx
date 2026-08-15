/* eslint-disable react/prop-types */
import { FaHandPaper, FaCheck, FaTimes } from 'react-icons/fa';
import { t } from '@extension/i18n';
import type { HandoffPayload } from '../types/event';

interface HandoffCardProps {
  request: HandoffPayload;
  onDone: () => void;
  onStop: () => void;
}

/**
 * The agent handed the tab to the user for a step only they can do — logging in, a captcha, a
 * verification code. The navigator is parked on a promise until "done" arrives, and anything the
 * user types during the handoff goes straight into the page: it never passes through the model or
 * the transcript. A graphite rail, not the warning one — this is cooperation, not danger.
 */
const HandoffCard: React.FC<HandoffCardProps> = ({ request, onDone, onStop }) => {
  let host = request.url;
  try {
    host = new URL(request.url).host;
  } catch {
    // a non-standard URL is still worth showing verbatim
  }

  return (
    <div className="mx-3 my-2 flex animate-rise overflow-hidden rounded-slab bg-canvas-raised shadow-neu-lg">
      <div className="w-1.5 shrink-0 bg-graphite" aria-hidden="true" />

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-2">
          <FaHandPaper className="shrink-0 text-ink" />
          <h3 className="text-sm font-semibold text-ink">{t('handoff_title')}</h3>
        </div>

        <div className="mt-3 rounded-soft bg-canvas-sunk p-3 shadow-neu-inset">
          <p className="whitespace-pre-wrap break-words text-sm font-medium text-ink">{request.instruction}</p>
          <p className="mt-1.5 truncate text-[11px] uppercase tracking-wide text-ink-faint">
            {t('handoff_onPage')}: {host}
          </p>
        </div>

        <p className="mt-2 text-xs text-ink-faint">{t('handoff_note')}</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onStop}
            className="flex items-center justify-center gap-1.5 rounded-soft bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
            <FaTimes size={12} />
            {t('handoff_stop')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-soft bg-graphite px-3 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed">
            <FaCheck size={12} />
            {t('handoff_done')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HandoffCard;
