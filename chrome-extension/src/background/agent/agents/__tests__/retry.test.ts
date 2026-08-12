import { describe, it, expect, vi } from 'vitest';
import { URLNotAllowedError } from '../../../browser/views';
import { isRetryableLLMError, RequestCancelledError, ResponseParseError } from '../errors';
import {
  abortableSleep,
  callWithRetry,
  computeBackoffMs,
  extractRetryAfterMs,
  LLM_BASE_DELAY_MS,
  LLM_MAX_ATTEMPTS,
} from '../retry';

/** A provider error carrying whatever fields that SDK actually attaches. */
function providerError(message: string, fields: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), fields);
}

/** The real text of an OpenAI 429 body. The digits in it are a trap for any message-scraping. */
const OPENAI_RATE_LIMIT_BODY =
  'Rate limit reached for gpt-4o in organization org-abc on requests per min (RPM): Limit 500, Used 500, Requested 1.';

/** A sleep that never actually waits, so the orchestration tests need no timers. */
const instantSleep = async () => {};

/**
 * The OpenAI SDK's connection error, reproduced by name only.
 *
 * `isRetryableLLMError` reads `error.constructor.name`, and 'APIConnectionError' is one of the names
 * it treats as retryable. Carrying that name is what makes an error a *positive* retry signal with
 * no status attached - which is the only way to tell a terminal guard apart from the default `false`.
 */
class APIConnectionError extends Error {}

describe('isRetryableLLMError', () => {
  describe('the provider said try again', () => {
    it.each([
      ['429 rate limited', 429],
      ['503 service unavailable', 503],
      ['529 overloaded', 529],
      ['500 internal error', 500],
      ['408 request timeout', 408],
    ])('retries a %s', (_label, status) => {
      expect(isRetryableLLMError(providerError('upstream said no', { status }))).toBe(true);
    });

    it('reads the Ollama client shape, which reports status_code', () => {
      expect(isRetryableLLMError(providerError('server error', { status_code: 500 }))).toBe(true);
    });
  });

  describe('the request itself is wrong, so a second identical one is pointless', () => {
    it.each([
      ['400 bad request', 400],
      ['401 unauthorized', 401],
      ['403 forbidden', 403],
      ['404 not found', 404],
    ])('does not retry a %s', (_label, status) => {
      expect(isRetryableLLMError(providerError('the request was rejected', { status }))).toBe(false);
    });
  });

  describe('cancellation is never a retry', () => {
    // AsyncCaller rejects with a plain `new Error('AbortError')`: the name is 'Error' and the string
    // does not contain 'Aborted', so isAbortedError alone misses it. Anthropic and Gemini use it.
    it('recognises the bare AbortError that isAbortedError misses', () => {
      const error = new Error('AbortError');
      expect(error.name).toBe('Error');
      expect(isRetryableLLMError(error)).toBe(false);
    });

    it('recognises a DOMException-style AbortError name', () => {
      expect(isRetryableLLMError(providerError('The user aborted a request.', { name: 'AbortError' }))).toBe(false);
    });

    it('does not retry our own cancellation', () => {
      expect(isRetryableLLMError(new RequestCancelledError('Aborted while waiting to retry'))).toBe(false);
    });

    // A cancellation that also carries a retryable status is the only input that separates the
    // cancellation guards from the default `false`: drop a guard and the 429 below turns a stop
    // request into two more calls to the provider, each with its own backoff.
    it('does not retry a bare AbortError that also arrived with a 429', () => {
      const error = providerError('AbortError', { status: 429 });
      expect(error.name).toBe('Error');
      expect(error.message.includes('Aborted')).toBe(false);
      expect(isRetryableLLMError(error)).toBe(false);
    });

    it('does not retry a "Cancelled" message that also arrived with a 429', () => {
      const error = providerError('Cancelled by the user', { status: 429 });
      expect(error.message.includes('Aborted')).toBe(false);
      expect(isRetryableLLMError(error)).toBe(false);
    });

    it('does not retry our own cancellation when the provider also said 429', () => {
      const error = Object.assign(new RequestCancelledError('the user stopped the task'), { status: 429 });
      expect(error.message.includes('Aborted')).toBe(false);
      expect(isRetryableLLMError(error)).toBe(false);
    });
  });

  describe('failures that never reached the model', () => {
    it('retries the TypeError a service worker sees when a connection drops', () => {
      expect(isRetryableLLMError(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('retries a socket-level code', () => {
      expect(isRetryableLLMError(providerError('read ECONNRESET', { code: 'ECONNRESET' }))).toBe(true);
    });
  });

  describe('failures that reproduce exactly', () => {
    it('does not retry a response we could not parse', () => {
      expect(isRetryableLLMError(new ResponseParseError('Could not manually extract JSON'))).toBe(false);
    });

    it('does not retry a blocked URL', () => {
      expect(isRetryableLLMError(new URLNotAllowedError('https://blocked.test is not allowed'))).toBe(false);
    });

    it('does not retry a non-Error rejection', () => {
      expect(isRetryableLLMError('just a string')).toBe(false);
      expect(isRetryableLLMError(null)).toBe(false);
    });

    // These reproduce because of what we did, not because of what the transport did, so a retryable
    // signal riding along on them has to lose. Without a competing signal the assertion would hold
    // on the default `false` alone and would say nothing about the guard.
    it('does not retry a parse failure that arrived on a 500 response', () => {
      const error = Object.assign(new ResponseParseError('Could not manually extract JSON'), { status: 500 });
      expect(isRetryableLLMError(error)).toBe(false);
    });

    it('does not retry a blocked URL raised while handling a 429', () => {
      const error = Object.assign(new URLNotAllowedError('https://blocked.test is not allowed'), { status: 429 });
      expect(isRetryableLLMError(error)).toBe(false);
    });
  });

  // Everything here has no status at all, so classification falls through to the message- and
  // name-shaped predicates - where the terminal check runs first. Each error also carries the
  // retryable constructor name, so removing the terminal check flips it to `true`.
  describe('a terminal request beats a retryable-looking error name', () => {
    it('does not retry a bad request that presents as a connection error', () => {
      const error = new APIConnectionError('Invalid parameter: model');
      expect(error.constructor.name).toBe('APIConnectionError');
      expect(isRetryableLLMError(error)).toBe(false);
    });

    it('does not retry a rejected API key that presents as a connection error', () => {
      expect(isRetryableLLMError(new APIConnectionError('Incorrect API key provided: sk-***'))).toBe(false);
    });

    it('does not retry a 403 that presents as a connection error', () => {
      expect(isRetryableLLMError(new APIConnectionError('Request failed with status 403 Forbidden'))).toBe(false);
    });

    // The control: the same class, with none of the terminal wording, is retried.
    it('still retries a plain connection error', () => {
      expect(isRetryableLLMError(new APIConnectionError('Connection error.'))).toBe(true);
    });
  });

  // "Limit 500, Used 500" would read as a 500 to anything scraping the message for digits, which
  // would turn every rate limit body into a retryable server error - and every 400 carrying one too.
  describe('classifies on the status, never on digits in the message', () => {
    it('retries the real OpenAI rate limit body when the status says 429', () => {
      expect(isRetryableLLMError(providerError(OPENAI_RATE_LIMIT_BODY, { status: 429 }))).toBe(true);
    });

    it('does not retry the same body when the status says 400', () => {
      expect(isRetryableLLMError(providerError(OPENAI_RATE_LIMIT_BODY, { status: 400 }))).toBe(false);
    });
  });
});

describe('computeBackoffMs', () => {
  it('waits exactly half the window when the jitter rolls low', () => {
    expect(computeBackoffMs(0, 1000, 10_000, () => 0)).toBe(500);
  });

  it('waits the whole window when the jitter rolls high', () => {
    expect(computeBackoffMs(0, 1000, 10_000, () => 1)).toBe(1000);
  });

  // Equal jitter: never less than half the window, so a 429 is never answered almost immediately.
  it('stays inside half the window either way', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const low = computeBackoffMs(attempt, 1000, 60_000, () => 0);
      const high = computeBackoffMs(attempt, 1000, 60_000, () => 1);
      expect(low).toBe(Math.round(high / 2));
    }
  });

  it('grows with each attempt', () => {
    const delays = [0, 1, 2, 3, 4].map(attempt => computeBackoffMs(attempt, 1000, 60_000, () => 0));
    delays.forEach((delay, index) => {
      if (index > 0) expect(delay).toBeGreaterThanOrEqual(delays[index - 1]);
    });
    expect(delays[4]).toBeGreaterThan(delays[0]);
  });

  it('never exceeds the cap, however many attempts have passed', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(computeBackoffMs(attempt, LLM_BASE_DELAY_MS, 5_000, () => 1)).toBeLessThanOrEqual(5_000);
    }
  });
});

describe('extractRetryAfterMs', () => {
  it('reads a plain-object header bag', () => {
    expect(extractRetryAfterMs(providerError('slow down', { headers: { 'retry-after': '2' } }))).toBe(2000);
  });

  it('reads a Headers instance', () => {
    expect(extractRetryAfterMs(providerError('slow down', { headers: new Headers({ 'retry-after': '3' }) }))).toBe(
      3000,
    );
  });

  it('accepts a fractional value', () => {
    expect(extractRetryAfterMs(providerError('slow down', { headers: { 'retry-after': '0.5' } }))).toBe(500);
  });

  it('ignores an HTTP-date, leaving the computed backoff to stand in', () => {
    const headers = { 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' };
    expect(extractRetryAfterMs(providerError('slow down', { headers }))).toBeUndefined();
  });

  it('ignores a negative value', () => {
    expect(extractRetryAfterMs(providerError('slow down', { headers: { 'retry-after': '-5' } }))).toBeUndefined();
  });

  it('returns undefined when there is no header at all', () => {
    expect(extractRetryAfterMs(providerError('slow down'))).toBeUndefined();
    expect(extractRetryAfterMs(providerError('slow down', { headers: {} }))).toBeUndefined();
    expect(extractRetryAfterMs(null)).toBeUndefined();
  });
});

describe('abortableSleep', () => {
  it('resolves once the wait is over', async () => {
    await expect(abortableSleep(1, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableSleep(60_000, controller.signal)).rejects.toBeInstanceOf(RequestCancelledError);
  });

  // The message has to contain "Aborted": that is what isAbortedError matches, which is how a stop
  // during a backoff unwinds as a cancellation rather than as a step failure.
  it('rejects mid-wait when the user stops the task', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableSleep(60_000, controller.signal);
      vi.advanceTimersByTime(1_000);
      controller.abort();
      await expect(pending).rejects.toThrow(/Aborted/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not leave the timer running after an abort', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableSleep(60_000, controller.signal).catch(() => 'cancelled');
      controller.abort();
      await expect(pending).resolves.toBe('cancelled');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('callWithRetry', () => {
  const baseOptions = (overrides: Partial<Parameters<typeof callWithRetry>[1]> = {}) => ({
    signal: new AbortController().signal,
    capMs: 10_000,
    sleep: instantSleep,
    random: () => 0,
    ...overrides,
  });

  it('calls once and returns when nothing goes wrong', async () => {
    const call = vi.fn().mockResolvedValue('ok');
    await expect(callWithRetry(call, baseOptions())).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit twice and then succeeds', async () => {
    const rateLimit = providerError('slow down', { status: 429 });
    const call = vi.fn().mockRejectedValueOnce(rateLimit).mockRejectedValueOnce(rateLimit).mockResolvedValue('ok');
    const retries: Array<[number, number]> = [];

    await expect(
      callWithRetry(call, baseOptions({ onRetry: (attempt, max) => retries.push([attempt, max]) })),
    ).resolves.toBe('ok');

    expect(call).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([
      [1, LLM_MAX_ATTEMPTS],
      [2, LLM_MAX_ATTEMPTS],
    ]);
  });

  // onRetry is what emits STEP_RETRY to the side panel. Announced after the wait instead of before
  // it, the panel sits silent for the whole backoff and the agent reads as hung.
  it('announces the retry before it starts waiting, not after', async () => {
    const rateLimit = providerError('slow down', { status: 429 });
    const call = vi.fn().mockRejectedValueOnce(rateLimit).mockRejectedValueOnce(rateLimit).mockResolvedValue('ok');
    const order: string[] = [];

    await expect(
      callWithRetry(
        call,
        baseOptions({
          onRetry: (attempt: number) => order.push(`onRetry:${attempt}`),
          sleep: async () => {
            order.push('sleep');
          },
        }),
      ),
    ).resolves.toBe('ok');

    expect(order).toEqual(['onRetry:1', 'sleep', 'onRetry:2', 'sleep']);
  });

  it('does not retry a bad request even once', async () => {
    const badRequest = providerError('invalid parameter', { status: 400 });
    const call = vi.fn().mockRejectedValue(badRequest);
    const onRetry = vi.fn();

    await expect(callWithRetry(call, baseOptions({ onRetry }))).rejects.toBe(badRequest);
    expect(call).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // The agents classify the final error by reading `status` off it, so it must arrive unwrapped.
  it('rethrows the original error object once the attempts are spent', async () => {
    const rateLimit = providerError('slow down', { status: 429 });
    const call = vi.fn().mockRejectedValue(rateLimit);

    const thrown = await callWithRetry(call, baseOptions()).catch((error: unknown) => error);

    expect(thrown).toBe(rateLimit);
    expect((thrown as { status?: number }).status).toBe(429);
    expect(call).toHaveBeenCalledTimes(LLM_MAX_ATTEMPTS);
  });

  it('honours maxAttempts when the caller sets one', async () => {
    const call = vi.fn().mockRejectedValue(providerError('slow down', { status: 429 }));
    await expect(callWithRetry(call, baseOptions({ maxAttempts: 5 }))).rejects.toThrow('slow down');
    expect(call).toHaveBeenCalledTimes(5);
  });

  // A provider can ask for a full day. Honouring that is indistinguishable from hanging.
  it('clamps a hostile Retry-After down to the cap', async () => {
    const rateLimit = providerError('slow down', { status: 429, headers: { 'retry-after': '86400' } });
    const call = vi.fn().mockRejectedValue(rateLimit);
    const delays: number[] = [];

    await expect(
      callWithRetry(call, baseOptions({ capMs: 2_000, onRetry: (_a, _m, delayMs) => delays.push(delayMs) })),
    ).rejects.toBe(rateLimit);

    expect(delays).not.toHaveLength(0);
    delays.forEach(delay => expect(delay).toBeLessThanOrEqual(2_000));
  });

  it('prefers the provider Retry-After when it is longer than the computed backoff', async () => {
    const rateLimit = providerError('slow down', { status: 429, headers: { 'retry-after': '4' } });
    const call = vi.fn().mockRejectedValueOnce(rateLimit).mockResolvedValue('ok');
    const delays: number[] = [];

    await callWithRetry(call, baseOptions({ capMs: 10_000, onRetry: (_a, _m, delayMs) => delays.push(delayMs) }));

    expect(delays).toEqual([4_000]);
  });

  it('stops as soon as the task is aborted during a backoff', async () => {
    const controller = new AbortController();
    const rateLimit = providerError('slow down', { status: 429 });
    const call = vi.fn().mockRejectedValue(rateLimit);
    const onRetry = vi.fn();

    await expect(
      callWithRetry(call, {
        signal: controller.signal,
        capMs: 10_000,
        maxAttempts: 5,
        onRetry,
        random: () => 0,
        sleep: async () => controller.abort(),
      }),
    ).rejects.toBe(rateLimit);

    expect(call).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
