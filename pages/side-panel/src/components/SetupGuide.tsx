import { t } from '@extension/i18n';
import { QUICK_START_URL, X_URL } from '../constants';

/** Quiet footer link on the pale ground. */
const quietLinkClass = 'text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline';

/**
 * Shown instead of the chat while no model is configured: without one there is nothing the
 * panel could do with a prompt, so the only offer is the settings page.
 */
const SetupGuide = () => (
  <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
    <div className="max-w-md animate-rise rounded-slab bg-canvas-raised px-6 py-8 text-center shadow-neu">
      <img src="mark.png" alt="Flowkite" className="mx-auto mb-5 size-14" />
      <h3 className="mb-2 text-lg font-semibold tracking-tight text-ink">{t('welcome_title')}</h3>
      <p className="mb-6 text-sm leading-relaxed text-ink-soft">{t('welcome_instruction')}</p>
      <button
        type="button"
        onClick={() => chrome.runtime.openOptionsPage()}
        className="rounded-soft bg-graphite px-5 py-2.5 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed">
        {t('welcome_openSettings')}
      </button>
      <div className="mt-8 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
      <div className="mt-4 flex items-center justify-center gap-3 text-xs">
        <a href={QUICK_START_URL} target="_blank" rel="noopener noreferrer" className={quietLinkClass}>
          {t('welcome_quickStart')}
        </a>
        <span aria-hidden="true" className="text-ink-faint">
          •
        </span>
        <a href={X_URL} target="_blank" rel="noopener noreferrer" className={quietLinkClass}>
          {t('welcome_joinCommunity')}
        </a>
      </div>
    </div>
  </div>
);

export default SetupGuide;
