import { useState, useEffect, useCallback } from 'react';
import { FiX } from 'react-icons/fi';
import { firewallStore } from '@extension/storage';
import { t } from '@extension/i18n';
import { Toggle } from './controls';

export const FirewallSettings = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [denyList, setDenyList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [activeList, setActiveList] = useState<'allow' | 'deny'>('allow');

  const loadFirewallSettings = useCallback(async () => {
    const settings = await firewallStore.getFirewall();
    setIsEnabled(settings.enabled);
    setAllowList(settings.allowList);
    setDenyList(settings.denyList);
  }, []);

  useEffect(() => {
    loadFirewallSettings();
  }, [loadFirewallSettings]);

  const handleToggleFirewall = async () => {
    await firewallStore.updateFirewall({ enabled: !isEnabled });
    await loadFirewallSettings();
  };

  const handleAddUrl = async () => {
    // Remove http:// or https:// prefixes
    const cleanUrl = newUrl.trim().replace(/^https?:\/\//, '');
    if (!cleanUrl) return;

    if (activeList === 'allow') {
      await firewallStore.addToAllowList(cleanUrl);
    } else {
      await firewallStore.addToDenyList(cleanUrl);
    }
    await loadFirewallSettings();
    setNewUrl('');
  };

  const handleRemoveUrl = async (url: string, listType: 'allow' | 'deny') => {
    if (listType === 'allow') {
      await firewallStore.removeFromAllowList(url);
    } else {
      await firewallStore.removeFromDenyList(url);
    }
    await loadFirewallSettings();
  };

  const isAllow = activeList === 'allow';
  const visibleList = isAllow ? allowList : denyList;

  // Segmented control: the selected side is a graphite key sunk into a pale well.
  const tabClass = (selected: boolean) =>
    selected
      ? 'rounded-pill bg-graphite px-5 py-2 text-sm font-medium text-graphite-50 shadow-key-sm transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed'
      : 'rounded-pill px-5 py-2 text-sm font-medium text-ink-soft transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm';

  return (
    <section className="space-y-6">
      <div className="text-left">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t('options_firewall_header')}</h2>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="toggle-firewall" className="cursor-pointer text-base font-medium text-ink">
              {t('options_firewall_enableToggle')}
            </label>
            <Toggle
              id="toggle-firewall"
              label={t('options_firewall_toggleFirewall_a11y')}
              checked={isEnabled}
              onChange={handleToggleFirewall}
            />
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex rounded-pill bg-canvas-sunk p-1 shadow-neu-inset-sm">
              <button type="button" onClick={() => setActiveList('allow')} className={tabClass(isAllow)}>
                {t('options_firewall_allowList_header')}
              </button>
              <button type="button" onClick={() => setActiveList('deny')} className={tabClass(!isAllow)}>
                {t('options_firewall_denyList_header')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="url-input"
              type="text"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddUrl();
                }
              }}
              placeholder={t('options_firewall_placeholders_domainUrl')}
              className="min-w-0 flex-1 rounded-soft bg-canvas-sunk px-4 py-2.5 text-sm text-ink shadow-neu-inset outline-none placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={!newUrl.trim()}
              className="shrink-0 rounded-soft bg-graphite px-5 py-2.5 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              {t('options_firewall_btnAdd')}
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-soft bg-canvas-sunk p-3 shadow-neu-inset">
            {visibleList.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {visibleList.map(url => (
                  <li
                    key={url}
                    className="inline-flex max-w-full items-center gap-2 rounded-pill bg-canvas-raised py-1 pl-3 pr-1 shadow-neu-sm">
                    <span
                      className={`size-1.5 shrink-0 rounded-pill ${isAllow ? 'bg-signal-ok' : 'bg-signal-bad'}`}
                      aria-hidden="true"
                    />
                    <span className={`truncate text-sm ${isAllow ? 'text-signal-ok' : 'text-signal-bad'}`}>{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveUrl(url, activeList)}
                      aria-label={t('options_firewall_btnRemove')}
                      title={t('options_firewall_btnRemove')}
                      className="grid size-6 shrink-0 place-items-center rounded-pill text-ink-faint transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm">
                      <FiX size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-ink-faint">
                {isAllow ? t('options_firewall_allowList_empty') : t('options_firewall_denyList_empty')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="text-left">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t('options_firewall_howItWorks_header')}</h2>
        <ul className="mt-4 space-y-3 text-left text-sm text-ink-soft">
          {t('options_firewall_howItWorks')
            .split('\n')
            .map((rule, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-ink-faint" aria-hidden="true" />
                <span>{rule}</span>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
};
