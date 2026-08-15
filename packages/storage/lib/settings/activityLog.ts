import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

/**
 * The local activity log behind the privacy dashboard: which hosts the agent visited and which
 * webhook deliveries went out, aggregated on this machine and never uploaded anywhere.
 *
 * This is the inverse of analytics. Analytics (opt-out, PostHog) tells the developers something;
 * this tells the USER everything — it exists so "what left my machine this week?" has a checkable
 * answer instead of a promise. Deliberately store-capped and one-click clearable.
 */
export interface HostVisit {
  count: number;
  lastAt: number;
}

export interface WebhookDeliveryEntry {
  /** host of the webhook URL, not the full URL — enough to recognise, nothing to leak */
  host: string;
  ok: boolean;
  ts: number;
  source: string;
}

export interface ActivityLogConfig {
  visits: Record<string, HostVisit>;
  webhooks: WebhookDeliveryEntry[];
}

/** Hosts kept before the least-recently-visited are evicted. */
export const ACTIVITY_MAX_HOSTS = 300;
/** Webhook deliveries kept, newest first. */
export const ACTIVITY_MAX_WEBHOOKS = 50;

const initialState: ActivityLogConfig = { visits: {}, webhooks: [] };

const storage = createStorage<ActivityLogConfig>('activity-log', initialState, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export type ActivityLogStorage = BaseStorage<ActivityLogConfig> & {
  recordVisit: (host: string, at?: number) => Promise<void>;
  recordWebhookDelivery: (entry: WebhookDeliveryEntry) => Promise<void>;
  clearAll: () => Promise<void>;
};

export const activityLogStore: ActivityLogStorage = {
  ...storage,
  async recordVisit(host: string, at: number = Date.now()) {
    const trimmed = host.trim().toLowerCase();
    if (!trimmed) return;
    await storage.set(prev => {
      const visits = { ...prev.visits };
      const existing = visits[trimmed];
      visits[trimmed] = { count: (existing?.count ?? 0) + 1, lastAt: at };

      // Evict the least-recently-visited hosts once over the cap, so the log stays a window
      // rather than a lifetime dossier.
      const hosts = Object.keys(visits);
      if (hosts.length > ACTIVITY_MAX_HOSTS) {
        hosts
          .sort((a, b) => visits[a].lastAt - visits[b].lastAt)
          .slice(0, hosts.length - ACTIVITY_MAX_HOSTS)
          .forEach(evicted => delete visits[evicted]);
      }
      return { ...prev, visits };
    });
  },
  async recordWebhookDelivery(entry: WebhookDeliveryEntry) {
    await storage.set(prev => ({
      ...prev,
      webhooks: [entry, ...prev.webhooks].slice(0, ACTIVITY_MAX_WEBHOOKS),
    }));
  },
  async clearAll() {
    await storage.set(initialState);
  },
};
