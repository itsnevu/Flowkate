import { webhookStore, isValidWebhookUrl } from '@extension/storage';
import { createLogger } from '../log';

const logger = createLogger('webhook');

/** What one finished task looks like on the wire. Field names are the public contract. */
export interface TaskWebhookPayload {
  source: 'manual' | 'scheduled';
  /** the task prompt as the user (or the schedule) wrote it */
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
 * POST a finished task to the user's webhook, if one is configured for this kind of run.
 *
 * Fire-and-forget by design: a webhook that is down must never fail, retry-storm, or slow down
 * the task that triggered it. One attempt, a hard timeout, and a log line either way.
 */
export async function dispatchTaskWebhook(payload: TaskWebhookPayload): Promise<void> {
  const config = await webhookStore.getConfig();
  if (!config.enabled || !isValidWebhookUrl(config.url)) return;
  if (payload.source === 'manual' && !config.sendManual) return;
  if (payload.source === 'scheduled' && !config.sendScheduled) return;

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
  } catch (error) {
    logger.warning('webhook delivery failed:', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
