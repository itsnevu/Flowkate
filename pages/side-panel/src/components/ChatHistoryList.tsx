/* eslint-disable react/prop-types */
import { FaTrash } from 'react-icons/fa';
import { BsBookmark } from 'react-icons/bs';
import { t } from '@extension/i18n';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionBookmark: (sessionId: string) => void;
  visible: boolean;
}

/** A raised card on the sunken well: lifts on hover, sinks while pressed. */
const SESSION_ROW =
  'group relative rounded-soft bg-canvas-raised p-3 shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm';

/**
 * Row action icon-button. Revealed on hover, but opacity-only so it stays in the
 * tab order and re-appears on keyboard focus.
 */
const ROW_ACTION =
  'grid size-7 place-items-center rounded-soft bg-canvas-raised shadow-neu-sm opacity-0 transition-all duration-150 ease-press group-hover:opacity-100 focus-visible:opacity-100 active:shadow-neu-inset-sm';

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionBookmark,
  visible,
}) => {
  if (!visible) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="h-full overflow-y-auto bg-canvas p-4">
      <h2 className="mb-3 text-lg font-semibold text-ink">{t('chat_history_title')}</h2>
      {sessions.length === 0 ? (
        <div className="rounded-soft bg-canvas-sunk p-6 text-center text-sm text-ink-faint shadow-neu-inset">
          {t('chat_history_empty')}
        </div>
      ) : (
        <div className="space-y-2 rounded-soft bg-canvas-sunk p-2 shadow-neu-inset">
          {sessions.map(session => (
            <div key={session.id} className={SESSION_ROW}>
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left" type="button">
                <h3 className="truncate pr-16 text-sm font-medium text-ink">{session.title}</h3>
                <p className="mt-1 text-xs text-ink-faint">{formatDate(session.createdAt)}</p>
              </button>

              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                {/* Bookmark this session */}
                {onSessionBookmark && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onSessionBookmark(session.id);
                    }}
                    className={`${ROW_ACTION} text-ink-faint hover:text-ink`}
                    aria-label={t('chat_history_bookmark')}
                    type="button">
                    <BsBookmark size={13} />
                  </button>
                )}

                {/* Delete this session */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionDelete(session.id);
                  }}
                  className={`${ROW_ACTION} text-ink-faint hover:text-signal-bad`}
                  aria-label={t('chat_history_delete')}
                  type="button">
                  <FaTrash size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistoryList;
