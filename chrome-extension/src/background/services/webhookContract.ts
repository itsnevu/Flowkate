/**
 * The two-way half of the webhook contract, kept pure and import-free so it can be tested without
 * the extension runtime.
 *
 * A webhook response may carry `{"followUp": "next task", "title": "optional name"}`. That string
 * becomes a new unattended task — which makes this a command channel, so its limits live here as
 * named constants rather than scattered magic numbers: a length cap (a follow-up is a task, not a
 * payload), and a chain cap (a receiver that always answers with a follow-up must terminate).
 */

export interface WebhookFollowUp {
  task: string;
  title?: string;
}

/** A follow-up is one task prompt, not a document. */
export const FOLLOW_UP_MAX_CHARS = 2000;

/** Origin task → follow-up → follow-up → follow-up, then the chain ends no matter what. */
export const FOLLOW_UP_MAX_CHAIN = 3;

const FOLLOW_UP_TITLE_MAX_CHARS = 80;

/** The follow-up a webhook response body carries, or null when it carries none worth acting on. */
export function parseFollowUp(raw: unknown): WebhookFollowUp | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = (raw as { followUp?: unknown }).followUp;
  if (typeof candidate !== 'string') return null;
  const task = candidate.trim();
  if (task === '' || task.length > FOLLOW_UP_MAX_CHARS) return null;

  const rawTitle = (raw as { title?: unknown }).title;
  const trimmedTitle = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  return {
    task,
    ...(trimmedTitle ? { title: trimmedTitle.slice(0, FOLLOW_UP_TITLE_MAX_CHARS) } : {}),
  };
}
