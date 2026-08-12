import { isRetryableLLMError, RequestCancelledError } from './errors';

/**
 * Total tries for one model call, first attempt included. Two retries covers what this exists for -
 * a single rate limit or a dropped connection - without turning a provider outage into a stall the
 * user cannot read anything into.
 */
export const LLM_MAX_ATTEMPTS = 3;

/** Floor for the backoff. Below about a second a 429 is just answered with another 429. */
export const LLM_BASE_DELAY_MS = 1_000;

export interface RetryOptions {
  /** Cancels the in-flight request AND any backoff still being waited out. */
  signal: AbortSignal;
  /** Ceiling for one backoff wait, in milliseconds. */
  capMs: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Told about each retry before the wait starts, for the log and the UI. */
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number, error: Error) => void;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
  /** Injectable for tests, so the orchestration cases need no fake timers. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Equal-jitter exponential backoff: half the window fixed, half random.
 *
 * Full jitter can produce a near-zero wait, which is the wrong reply to a 429; no jitter at all has
 * the navigator and the planner retrying in lockstep against the same rate limit.
 *
 * @param attempt - zero-based index of the retry about to be waited out
 */
export function computeBackoffMs(
  attempt: number,
  baseDelayMs: number,
  capMs: number,
  random: () => number = Math.random,
): number {
  const window = Math.min(capMs, baseDelayMs * 2 ** attempt);
  return Math.round(window / 2 + random() * (window / 2));
}

/**
 * The provider's own answer to "come back when", if it gave one.
 *
 * Only the OpenAI and Anthropic clients attach response headers to their errors, so everyone else
 * falls through to the computed backoff. An HTTP-date Retry-After is ignored on purpose: `Number`
 * returns NaN for it and the computed delay is a fine substitute.
 */
export function extractRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: unknown } | null)?.headers;
  let raw: string | null = null;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    raw = headers.get('retry-after');
  } else if (typeof headers === 'object' && headers !== null) {
    raw = (headers as Record<string, string>)['retry-after'] ?? null;
  }
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/**
 * Sleep that a cancelled task can cut short.
 *
 * A backoff that only hands its signal to the HTTP call leaves the agent parked for the full delay
 * after the user hits stop, so the wait itself has to listen too. The rejection message contains
 * "Aborted" deliberately: that is what `isAbortedError` matches on, which is how this unwinds
 * through the agents as a cancellation rather than as a step failure.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new RequestCancelledError('Aborted while waiting to retry'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RequestCancelledError('Aborted while waiting to retry'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run one model call, trying again only when the failure was the network or the provider rather
 * than the request.
 *
 * The error from the final attempt is rethrown as the original object, not wrapped: `status` and
 * the provider's message are what the agents' existing `isAuthenticationError` /
 * `isBadRequestError` / `isForbiddenError` classification reads, and wrapping would blind it.
 */
export async function callWithRetry<T>(call: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = options.maxAttempts ?? LLM_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? LLM_BASE_DELAY_MS;
  const sleep = options.sleep ?? abortableSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || options.signal.aborted || !isRetryableLLMError(error)) {
        throw error;
      }
      const computed = computeBackoffMs(attempt, baseDelayMs, options.capMs, options.random);
      const suggested = extractRetryAfterMs(error);
      // Clamped from above, so a hostile `Retry-After: 86400` can only ever shorten the ceiling.
      const delayMs = Math.min(options.capMs, Math.max(suggested ?? 0, computed));
      options.onRetry?.(attempt + 1, maxAttempts, delayMs, error as Error);
      await sleep(delayMs, options.signal);
    }
  }
  // Unreachable: the loop either returns or throws. Present so the signature holds without a cast.
  throw lastError;
}
