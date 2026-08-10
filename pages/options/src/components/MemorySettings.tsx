import { useState, useEffect, useCallback } from 'react';
import { FiTrash2, FiGlobe, FiLink } from 'react-icons/fi';
import { memoryStore, MemoryScope, MAX_MEMORY_ENTRIES, type MemoryEntry } from '@extension/storage';
import { t } from '@extension/i18n';

interface MemorySettingsProps {
  isDarkMode?: boolean;
}

/**
 * Everything the agent remembers, in one place the user can read and edit. Memory that a user cannot
 * inspect or delete is memory they cannot consent to, so this view is part of the feature, not an
 * optional extra.
 */
export const MemorySettings = ({ isDarkMode = false }: MemorySettingsProps) => {
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

  const cardClass = isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-blue-100 bg-white';
  const headingClass = isDarkMode ? 'text-gray-200' : 'text-gray-800';
  const bodyClass = isDarkMode ? 'text-gray-300' : 'text-gray-700';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <section className="space-y-6">
      <div className={`rounded-lg border ${cardClass} p-6 text-left shadow-sm`}>
        <h2 className={`mb-1 text-left text-xl font-semibold ${headingClass}`}>{t('options_memory_header')}</h2>
        <p className={`mb-4 text-sm ${mutedClass}`}>{t('options_memory_localOnly')}</p>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className={`text-base font-medium ${bodyClass}`}>{t('options_memory_enable')}</h3>
            <p className={`text-sm font-normal ${mutedClass}`}>{t('options_memory_enable_desc')}</p>
          </div>
          <div className="relative inline-flex cursor-pointer items-center">
            <input
              id="memoryEnabled"
              type="checkbox"
              checked={enabled}
              onChange={e => handleToggle(e.target.checked)}
              className="peer sr-only"
            />
            <label
              htmlFor="memoryEnabled"
              className={`peer h-6 w-11 rounded-full ${isDarkMode ? 'bg-slate-600' : 'bg-gray-200'} after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300`}>
              <span className="sr-only">{t('options_memory_enable')}</span>
            </label>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className={`text-base font-medium ${bodyClass}`}>
            {t('options_memory_stored')} ({entries.length}/{MAX_MEMORY_ENTRIES})
          </h3>
          {entries.length > 0 &&
            (confirmingClear ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleForgetAll}
                  className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700">
                  {t('options_memory_forgetAll_confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className={`rounded px-3 py-1 text-sm font-medium ${isDarkMode ? 'bg-slate-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>
                  {t('options_memory_forgetAll_cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className={`rounded border px-3 py-1 text-sm font-medium ${isDarkMode ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                {t('options_memory_forgetAll')}
              </button>
            ))}
        </div>

        {entries.length === 0 ? (
          <p className={`text-sm ${mutedClass}`}>{t('options_memory_empty')}</p>
        ) : (
          <ul className="space-y-2">
            {entries.map(entry => (
              <li
                key={entry.id}
                className={`flex items-start justify-between gap-3 rounded border p-3 ${isDarkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className={`break-words text-sm ${bodyClass}`}>{entry.content}</p>
                  <p className={`mt-1 flex items-center gap-1 text-xs ${mutedClass}`}>
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
                  className={`shrink-0 rounded p-1.5 ${isDarkMode ? 'text-gray-400 hover:bg-slate-700 hover:text-red-400' : 'text-gray-500 hover:bg-gray-200 hover:text-red-600'}`}>
                  <FiTrash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
