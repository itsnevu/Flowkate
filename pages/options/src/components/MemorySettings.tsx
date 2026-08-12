import { useState, useEffect, useCallback } from 'react';
import { FiTrash2, FiGlobe, FiLink } from 'react-icons/fi';
import { memoryStore, MemoryScope, MAX_MEMORY_ENTRIES, type MemoryEntry } from '@extension/storage';
import { t } from '@extension/i18n';
import { Toggle } from './controls';

/**
 * Everything the agent remembers, in one place the user can read and edit. Memory that a user cannot
 * inspect or delete is memory they cannot consent to, so this view is part of the feature, not an
 * optional extra.
 */
export const MemorySettings = () => {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = useCallback(async () => {
    setEntries(await memoryStore.getAll());
    setEnabled(await memoryStore.isEnabled());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    await memoryStore.setEnabled(next);
  };

  const handleForget = async (id: number) => {
    await memoryStore.forget(id);
    await load();
  };

  const handleForgetAll = async () => {
    await memoryStore.forgetAll();
    setConfirmingClear(false);
    await load();
  };

  return (
    <section className="space-y-6">
      <div className="text-left">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t('options_memory_header')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('options_memory_localOnly')}</p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-medium text-ink">{t('options_memory_enable')}</h3>
            <p className="text-sm font-normal text-ink-soft">{t('options_memory_enable_desc')}</p>
          </div>
          <Toggle id="memoryEnabled" label={t('options_memory_enable')} checked={enabled} onChange={handleToggle} />
        </div>

        <div className="my-6 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

        <h3 className="mb-3 text-base font-medium text-ink">
          {t('options_memory_stored')} ({entries.length}/{MAX_MEMORY_ENTRIES})
        </h3>

        {entries.length === 0 ? (
          <div className="rounded-soft bg-canvas-sunk p-5 shadow-neu-inset">
            <p className="text-center text-sm text-ink-faint">{t('options_memory_empty')}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map(entry => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-soft bg-canvas-raised p-4 shadow-neu-sm">
                <div className="min-w-0">
                  <p className="break-words text-sm text-ink">{entry.content}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
                    {entry.scope === MemoryScope.SITE ? <FiLink size={11} /> : <FiGlobe size={11} />}
                    {entry.scope === MemoryScope.SITE ? entry.host : t('options_memory_scope_global')}
                    {' · '}
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleForget(entry.id)}
                  aria-label={t('options_memory_forget')}
                  title={t('options_memory_forget')}
                  className="grid size-9 shrink-0 place-items-center rounded-soft bg-canvas-raised text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-signal-bad active:shadow-neu-inset-sm">
                  <FiTrash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {entries.length > 0 && (
          <>
            <div className="my-6 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
            <div className="flex justify-end">
              {confirmingClear ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleForgetAll}
                    className="rounded-soft bg-graphite px-4 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed">
                    {t('options_memory_forgetAll_confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="rounded-soft bg-canvas-raised px-4 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
                    {t('options_memory_forgetAll_cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  className="rounded-soft bg-canvas-raised px-4 py-2 text-sm font-medium text-signal-bad shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm">
                  {t('options_memory_forgetAll')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
