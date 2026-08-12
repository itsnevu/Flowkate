import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_GENERAL_SETTINGS, generalSettingsStore } from '@extension/storage';
import type { MutableRefObject } from 'react';
import type { ApprovalMode } from '@extension/storage';

interface UseApprovalModeProps {
  /** posted to directly, so a re-render can never swap the port out from under a commit */
  portRef: MutableRefObject<chrome.runtime.Port | null>;
}

/**
 * The composer's approval mode: what it currently is, and the one rule about changing it.
 *
 * A mode change has to land in three places to be honest, which is why this is a hook rather than
 * an onClick. Storage makes it survive the panel closing; panel state makes it visible; the port
 * message makes a *running* task obey it. Skipping the third is the failure this exists to avoid —
 * the Executor snapshots its mode at construction and follow-up tasks reuse that same instance, so
 * a picker that only wrote to storage would appear to work and then be ignored all session.
 */
export const useApprovalMode = ({ portRef }: UseApprovalModeProps) => {
  const [mode, setMode] = useState<ApprovalMode>(DEFAULT_GENERAL_SETTINGS.approvalMode);
  /** true while the user is being shown what `auto` gives up; nothing is written until they answer */
  const [pendingAutoNotice, setPendingAutoNotice] = useState(false);
  /**
   * Mirrors the stored acknowledgement. Held as a ref as well as in storage so `selectMode` can
   * read it synchronously — reading it from state would let a fast second click through before the
   * re-render landed.
   */
  const acknowledgedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    generalSettingsStore
      .getSettings()
      .then(settings => {
        if (cancelled) return;
        setMode(settings.approvalMode);
        acknowledgedRef.current = settings.autoModeAcknowledged;
      })
      .catch(error => console.error('Failed to load approval mode:', error));

    // generalSettings is created with liveUpdate, so the options page changing the mode is
    // reflected here without a reload.
    const unsubscribe = generalSettingsStore.subscribe(() => {
      generalSettingsStore
        .getSettings()
        .then(settings => {
          if (cancelled) return;
          setMode(settings.approvalMode);
          acknowledgedRef.current = settings.autoModeAcknowledged;
        })
        .catch(error => console.error('Failed to refresh approval mode:', error));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /** Apply a mode everywhere at once: storage (persistent), panel state (visible), executor (live). */
  const commit = useCallback(
    async (next: ApprovalMode) => {
      setMode(next);
      // Posted before the await so a running task tightens immediately rather than after a storage
      // round-trip. Tightening late is the direction that costs something.
      portRef.current?.postMessage({ type: 'set_approval_mode', mode: next });
      try {
        await generalSettingsStore.updateSettings({ approvalMode: next });
      } catch (error) {
        console.error('Failed to persist approval mode:', error);
      }
    },
    [portRef],
  );

  /** Auto is the one choice that removes protection, so it is the one choice that is not one click. */
  const selectMode = useCallback(
    (next: ApprovalMode) => {
      if (next === 'auto' && !acknowledgedRef.current) {
        setPendingAutoNotice(true);
        return;
      }
      void commit(next);
    },
    [commit],
  );

  const acknowledgeAuto = useCallback(async () => {
    acknowledgedRef.current = true;
    setPendingAutoNotice(false);
    setMode('auto');
    portRef.current?.postMessage({ type: 'set_approval_mode', mode: 'auto' });
    // One write, so a reload between the two can never leave `auto` on without the acknowledgement.
    try {
      await generalSettingsStore.updateSettings({ approvalMode: 'auto', autoModeAcknowledged: true });
    } catch (error) {
      console.error('Failed to persist auto mode acknowledgement:', error);
    }
  }, [portRef]);

  const dismissAutoNotice = useCallback(() => setPendingAutoNotice(false), []);

  return { mode, selectMode, pendingAutoNotice, acknowledgeAuto, dismissAutoNotice };
};
