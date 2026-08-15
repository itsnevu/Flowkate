import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

/**
 * The outbound webhook: when a task finishes, POST its outcome to one URL the user configured.
 *
 * This is the whole integration story on purpose — outbound only, user-addressed, off by default.
 * It connects Flowkite to n8n, Zapier, a Discord webhook or anything else with a URL, without
 * Flowkite gaining a server, an account, or any inbound surface.
 */
export interface WebhookConfig {
  enabled: boolean;
  url: string;
  /** Fire for tasks the user ran from the side panel. */
  sendManual: boolean;
  /** Fire for scheduled (unattended) runs — the case the feature exists for. */
  sendScheduled: boolean;
  /**
   * Let the webhook's RESPONSE queue a follow-up task: `{"followUp": "..."}` in the response body
   * runs as a new unattended task. This is what turns the webhook into a two-way pipeline — n8n
   * can decide the next step — without Flowkite gaining any inbound surface: the only party that
   * can ever speak here is the one URL the user typed in. Off by default; follow-ups run under
   * unattended rules (sensitive actions auto-decline) and the chain is hard-capped.
   */
  allowFollowUp: boolean;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  url: '',
  sendManual: false,
  sendScheduled: true,
  allowFollowUp: false,
};

/**
 * Where a result may be sent: HTTPS anywhere, or plain HTTP only to the user's own machine.
 * Task results can contain page content; broadcasting them unencrypted across a network is not a
 * configuration this will accept.
 */
export function isValidWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  }
  return false;
}

export type WebhookStorage = BaseStorage<WebhookConfig> & {
  updateConfig: (patch: Partial<WebhookConfig>) => Promise<void>;
  getConfig: () => Promise<WebhookConfig>;
};

const storage = createStorage<WebhookConfig>('webhook-settings', DEFAULT_WEBHOOK_CONFIG, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const webhookStore: WebhookStorage = {
  ...storage,
  async updateConfig(patch) {
    await storage.set(prev => ({ ...DEFAULT_WEBHOOK_CONFIG, ...prev, ...patch }));
  },
  async getConfig() {
    return { ...DEFAULT_WEBHOOK_CONFIG, ...(await storage.get()) };
  },
};
