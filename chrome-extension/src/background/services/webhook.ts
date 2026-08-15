import { webhookStore, isValidWebhookUrl, activityLogStore } from '@extension/storage';
import { createLogger } from '../log';
import { parseFollowUp } from './webhookContract';
import type { WebhookFollowUp } from './webhookContract';

const logger = createLogger('webhook');

/** What one finished task looks like on the wire. Field names are the public contract. */
export interface TaskWebhookPayload {
  source: 'manual' | 'scheduled' | 'followup';
  /** the task prompt as the user (or the schedule, or the webhook's own follow-up) wrote it */
  task: string;
  /** the schedule's name, for scheduled runs */
  title?: string;
  outcome: 'ok' | 'fail' | 'cancel';
  /** the task's final message */
  result: string;
  startedAt: number;
  finishedAt: number;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * POST a finished task to the user's webhook, if one is configured for this kind of run, and
 * return the follow-up task its response asked for — if the user allowed responses to ask.
 *
 * Fire-and-forget on the delivery side: a webhook that is down must never fail, retry-storm, or
 * slow down the task that triggered it. One attempt, a hard timeout, and a log line either way.
 * The follow-up is read only from a 2xx response, and only when `allowFollowUp` is on.
 */
export async function dispatchTaskWebhook(payload: TaskWebhookPayload): Promise<WebhookFollowUp | null> {
  const config = await webhookStore.getConfig();
  if (!config.enabled || !isValidWebhookUrl(config.url)) return null;
  if (payload.source === 'manual' && !config.sendManual) return null;
  // Follow-ups ride the scheduled toggle: both are unattended runs the user is not watching.
  if ((payload.source === 'scheduled' || payload.source === 'followup') && !config.sendScheduled) return null;

  // The delivery target's host, for the user's local activity log (the privacy dashboard).
  let targetHost = '';
  try {
    targetHost = new URL(config.url).host;
  } catch {
    // isValidWebhookUrl already vouched for it; belt and braces
  }
  const logDelivery = (ok: boolean) => {
    if (!targetHost) return;
    void activityLogStore
      .recordWebhookDelivery({ host: targetHost, ok, ts: Date.now(), source: payload.source })
      .catch(() => {});
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    logger.info(`webhook delivered (${response.status}) for ${payload.source} task`);
    logDelivery(response.ok);

    if (!config.allowFollowUp || !response.ok) return null;
    const body = await response.json().catch(() => null);
    return parseFollowUp(body);
  } catch (error) {
    logger.warning('webhook delivery failed:', error instanceof Error ? error.message : String(error));
    logDelivery(false);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
