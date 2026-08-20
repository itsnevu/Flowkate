import { webhookStore, isValidWebhookUrl, activityLogStore } from '@extension/storage';
import { createLogger } from '../log';
import { parseFollowUp, datasetForWebhook } from './webhookContract';
import type { WebhookFollowUp, WebhookDataset } from './webhookContract';

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
  /**
   * The table an extraction task collected, when there is one AND the user turned on `includeData`.
   *
   * Always passed in by the caller; whether it reaches the wire is decided here, with the rest of
   * the config, so there is one place that knows what this webhook is allowed to say.
   */
  dataset?: WebhookDataset;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Ceiling on the response body we will read.
 *
 * A follow-up is at most a couple of kilobytes of JSON, so this is already generous. Without it the
 * timeout is the only bound, and ten seconds of a fast connection is well over a gigabyte buffered
 * inside the service worker - which does not just fail the delivery, it takes the running task down
 * with the worker.
 */
const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Read a webhook response as JSON, refusing anything past the size cap.
 *
 * `response.json()` buffers whatever arrives; a chunked response declares no length, so the cap has
 * to be enforced while reading rather than from `Content-Length` alone.
 */
async function readCappedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > WEBHOOK_MAX_RESPONSE_BYTES) {
    logger.warning(`webhook response declared ${declared} bytes, over the ${WEBHOOK_MAX_RESPONSE_BYTES} cap`);
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > WEBHOOK_MAX_RESPONSE_BYTES) {
        logger.warning('webhook response exceeded the size cap; discarding it');
        return null;
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    return null;
  }
}

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
    // Rows only travel when the user asked for them, and only as many as the budget allows.
    const dataset = config.includeData ? datasetForWebhook(payload.dataset) : null;
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `undefined` is dropped by JSON.stringify, so a run that collected nothing sends the same
      // body it always did.
      body: JSON.stringify({ ...payload, dataset: dataset ?? undefined }),
      signal: controller.signal,
      // A redirect is refused, not followed. 307 and 308 preserve the method and the body, so a
      // webhook host answering `Location: http://169.254.169.254/` - whether it was taken over,
      // mistyped, or hijacked at DNS - would have the task prompt, the result and any collected
      // rows re-POSTed to an address the user never configured and `isValidWebhookUrl` never saw.
      // Re-validating afterwards cannot help: by then the bytes have already been sent. An endpoint
      // that genuinely redirects should be configured as its final URL.
      redirect: 'error',
      // Stated rather than inherited. The extension origin holds no cookies for the target, so this
      // is already the effective behaviour - but it is a property of a request carrying page
      // content, and it should not rest on a default staying what it is.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    logger.info(`webhook delivered (${response.status}) for ${payload.source} task`);
    logDelivery(response.ok);

    if (!config.allowFollowUp || !response.ok) return null;
    const body = await readCappedJson(response).catch(() => null);
    return parseFollowUp(body);
  } catch (error) {
    logger.warning('webhook delivery failed:', error instanceof Error ? error.message : String(error));
    logDelivery(false);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
