import { useEffect, useState } from 'react';
import { loadOpenRouterCatalog } from './openRouterCatalog';
import type { OpenRouterModel } from './openRouterCatalog';

export type CatalogStatus = 'loading' | 'ready' | 'unavailable';

export interface OpenRouterCatalogState {
  /** Null until the list arrives, and for good if it never does. */
  models: OpenRouterModel[] | null;
  status: CatalogStatus;
}

/**
 * One request per options page, shared by every OpenRouter card on it.
 *
 * Module scope rather than hook state: a user with two OpenRouter providers configured would
 * otherwise fetch the same few hundred entries twice for no reason.
 */
let pending: Promise<OpenRouterModel[]> | null = null;

function catalogOnce(): Promise<OpenRouterModel[]> {
  if (!pending) {
    pending = loadOpenRouterCatalog().catch(error => {
      // A failure must not be memoised for the life of the page: the user may well fix their
      // connection and reopen the card, and that attempt deserves a real request.
      pending = null;
      throw error;
    });
  }
  return pending;
}

/**
 * The OpenRouter model list, loaded the first time a card asks for it.
 *
 * There is no `enabled` flag: the only component that calls this renders for OpenRouter alone, so
 * mounting it is already the decision to fetch.
 */
export function useOpenRouterCatalog(): OpenRouterCatalogState {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [status, setStatus] = useState<CatalogStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    catalogOnce()
      .then(loaded => {
        if (cancelled) return;
        setModels(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { models, status };
}
