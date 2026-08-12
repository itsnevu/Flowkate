import { useEffect, useRef } from 'react';
import { FaBolt } from 'react-icons/fa';
import { t } from '@extension/i18n';

interface AutoModeNoticeProps {
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * The one-time sheet standing between the user and a mode with no checks at all.
 *
 * Shown once ever, not on every Auto selection: a dialog the user meets repeatedly becomes a reflex
 * within a day and stops informing anyone. Once, with the consequences named in plain words, is the
 * version that does work — after that the warn-coloured pill in the composer is the standing
 * reminder.
 *
 * Not dismissable by accident. There is no backdrop click and no Escape handler, so the only ways
 * out are the two buttons; and the cancel button takes initial focus, so a stray Enter or Space
 * keeps the current mode rather than switching off every check.
 */
const AutoModeNotice = ({ onConfirm, onDismiss }: AutoModeNoticeProps) => {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dismissRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      // Deliberately NOT aria-modal: this is an in-flow card and everything behind it stays
      // interactive, so claiming modality would tell assistive tech the rest of the panel is inert
      // when it is not. It still takes focus and still gates the mode change - selectMode returns
      // without committing until it is answered - which is what actually makes it safe.
      aria-labelledby="auto-mode-notice-title"
      aria-describedby="auto-mode-notice-body"
      className="mx-3 my-2 flex animate-rise overflow-hidden rounded-slab bg-canvas-raised shadow-neu-lg">
      {/* Warning rail — the only saturated element on the card. */}
      <div className="w-1.5 shrink-0 bg-signal-warn" aria-hidden="true" />

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center gap-2">
          <FaBolt className="shrink-0 text-signal-warn" aria-hidden="true" />
          <h3 id="auto-mode-notice-title" className="text-sm font-semibold text-ink">
            {t('chat_mode_autoNotice_title')}
          </h3>
        </div>

        <p id="auto-mode-notice-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {t('chat_mode_autoNotice_body')}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            ref={dismissRef}
            type="button"
            onClick={onDismiss}
            className="flex flex-1 items-center justify-center rounded-soft bg-canvas-raised px-3 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
            {t('chat_mode_autoNotice_cancel')}
          </button>
          {/*
            Deliberately not the inviting graphite key the other cards use for their affirmative
            button. This one switches protection off, so it gets the quiet raised treatment and
            names the risk in warn colour instead of looking like the obvious thing to press.
          */}
          <button
            type="button"
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center rounded-soft bg-canvas-raised px-3 py-2 text-sm font-semibold text-signal-warn shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
            {t('chat_mode_autoNotice_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoModeNotice;
