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

/**
 * The table an extraction task collected, as it appears in the POST body under `dataset`.
 *
 * Declared here rather than imported so this file stays free of the extension runtime; it mirrors
 * the stored MessageDataset, which is what the caller hands over.
 */
export interface WebhookDataset {
  fields: string[];
  rows: string[][];
  /** true when the receiver is holding a prefix rather than everything the task collected */
  truncated: boolean;
}

/**
 * Character budget for the rows on the wire.
 *
 * The collector already bounds a table at 2000 rows of 500-character cells, which is comfortable
 * for a file on disk and absurd for an HTTP body — 12MB in the worst case, at a receiver that
 * probably caps its own request size well below that. This is the second bound, applied only where
 * it matters: enough that a realistic scrape of a few thousand rows arrives whole, low enough that
 * a pathological one cannot make the delivery fail as a whole instead of arriving short.
 */
export const WEBHOOK_MAX_DATASET_CHARS = 2_000_000;

/**
 * The rows that fit in the budget, or null when there is nothing worth sending.
 *
 * Trims rather than refuses, and says so: a receiver holding the first 1,800 rows of 2,000 with
 * `truncated: true` can act on them and know to go looking for the rest. One holding nothing
 * because the body was too big learns only that the webhook is unreliable.
 */
export function datasetForWebhook(dataset: WebhookDataset | undefined): WebhookDataset | null {
  if (!dataset || dataset.rows.length === 0 || dataset.fields.length === 0) return null;

  const rows: string[][] = [];
  let spent = JSON.stringify(dataset.fields).length;
  for (const row of dataset.rows) {
    spent += JSON.stringify(row).length + 1;
    // The first row always goes, whatever it costs. Cells are capped at 500 characters upstream so
    // no real row comes close to the budget, and a body with the columns but no row at all would
    // tell the receiver less than one oversized row does.
    if (spent > WEBHOOK_MAX_DATASET_CHARS && rows.length > 0) break;
    rows.push(row);
  }

  // A row left behind by the budget is a row the receiver is not getting, which is the same fact
  // `truncated` already carries for rows the collector itself turned away.
  return { fields: dataset.fields, rows, truncated: dataset.truncated || rows.length < dataset.rows.length };
}
