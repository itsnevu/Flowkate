import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseAgent } from '../base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { AgentContext, AgentOutput } from '../../types';
import type { BasePrompt } from '../../prompts/base';

/**
 * OpenRouter's answer when the upstream provider refuses `response_format: {type: 'json_schema'}`.
 *
 * The message names nothing - no parameter, no format - and does not even contain ' 400' with the
 * leading space `isBadRequestError` looks for. The status on the SDK error is the only handle.
 */
function formatRejection(): Error {
  return Object.assign(new Error('400 Provider returned error'), { status: 400 });
}

const schema = z.object({ answer: z.string() });

/** A model whose reply depends only on which structured-output method the caller asked for. */
function fakeModel(modelName: string, reply: (method: string | undefined) => Promise<unknown>) {
  const methods: (string | undefined)[] = [];
  const chatLLM = {
    modelName,
    withStructuredOutput: (_schema: unknown, config: { method?: string }) => ({
      invoke: () => {
        methods.push(config.method);
        return reply(config.method);
      },
    }),
  } as unknown as BaseChatModel;
  return { chatLLM, methods };
}

/** A reply that only tool calling gets, which is the shape the OpenRouter models in question have. */
async function toolCallingOnly(method: string | undefined) {
  if (method !== 'functionCalling') throw formatRejection();
  return { raw: new AIMessage(''), parsed: { answer: 'ok' } };
}

class TestAgent extends BaseAgent<typeof schema> {
  async execute(): Promise<AgentOutput<unknown>> {
    return { id: this.id };
  }

  /** Opens the protected call up to the test without widening it for the rest of the codebase. */
  call(messages: BaseMessage[] = []) {
    return this.invokeStructured(this.modelOutputSchema, messages);
  }
}

function buildAgent(chatLLM: BaseChatModel, provider = 'openrouter') {
  const context = {
    controller: new AbortController(),
    options: { retryDelay: 1 },
    emitEvent: vi.fn(),
  } as unknown as AgentContext;
  return new TestAgent(schema, { chatLLM, context, provider, prompt: {} as BasePrompt });
}

describe('invokeStructured', () => {
  it('leads with the provider default, so nothing changes for models that accept it', async () => {
    const { chatLLM, methods } = fakeModel('happy-model', async () => ({
      raw: new AIMessage(''),
      parsed: { answer: 'ok' },
    }));

    const response = await buildAgent(chatLLM).call();

    expect(response.parsed).toEqual({ answer: 'ok' });
    expect(methods).toEqual([undefined]);
  });

  it('retries under tool calling when the provider rejects the default format', async () => {
    const { chatLLM, methods } = fakeModel('stepfun/step-3.5-flash', toolCallingOnly);

    const response = await buildAgent(chatLLM).call();

    expect(response.parsed).toEqual({ answer: 'ok' });
    expect(methods).toEqual([undefined, 'functionCalling']);
  });

  it('remembers the fallback, so only the first task on that model pays the rejected request', async () => {
    // The first agent above already paid it for stepfun/step-3.5-flash on openrouter. Agents are
    // rebuilt for every task, so the memo has to outlive this instance to be worth anything.
    const { chatLLM, methods } = fakeModel('stepfun/step-3.5-flash', toolCallingOnly);

    await buildAgent(chatLLM).call();

    expect(methods).toEqual(['functionCalling']);
  });

  it('keys the memo on the provider, since the same model id can come from a different endpoint', async () => {
    const { chatLLM, methods } = fakeModel('stepfun/step-3.5-flash', toolCallingOnly);

    await buildAgent(chatLLM, 'custom_openai').call();

    expect(methods).toEqual([undefined, 'functionCalling']);
  });

  it('reports the original error when the 400 was about the request rather than the format', async () => {
    const tooLong = Object.assign(new Error('400 maximum context length exceeded'), { status: 400 });
    const { chatLLM, methods } = fakeModel('overloaded-model', async () => {
      throw tooLong;
    });

    await expect(buildAgent(chatLLM).call()).rejects.toBe(tooLong);
    expect(methods).toEqual([undefined, 'functionCalling']);
  });

  // Anthropic, Grok, DeepSeek, Cerebras and Groq already send tool calls on the first attempt, so
  // the retry would be the same request twice and buy nothing but a second bill and a longer wait.
  it.each([['anthropic'], ['grok'], ['deepseek'], ['cerebras'], ['groq']])(
    'does not retry %s, whose client already leads with tool calling',
    async provider => {
      const rejection = formatRejection();
      const { chatLLM, methods } = fakeModel(`${provider}-model`, async () => {
        throw rejection;
      });

      await expect(buildAgent(chatLLM, provider).call()).rejects.toBe(rejection);
      expect(methods).toEqual([undefined]);
    },
  );

  it('does not read an unrelated failure as a format problem', async () => {
    const unauthorized = Object.assign(new Error('401 Incorrect API key'), { status: 401 });
    const { chatLLM, methods } = fakeModel('unauthorized-model', async () => {
      throw unauthorized;
    });

    await expect(buildAgent(chatLLM).call()).rejects.toBe(unauthorized);
    expect(methods).toEqual([undefined]);
  });
});

/**
 * What the two config forms actually put on the wire.
 *
 * `invokeStructured` leads with `method: undefined` rather than omitting the key, on the reading
 * that every LangChain client treats the two the same. That reading is the one thing in this file
 * that could break every provider at once if a dependency bump falsified it, and it is invisible
 * from our own code - so it is pinned here against the real clients instead of being trusted.
 *
 * Nothing leaves the machine: the injected fetch records the body and throws.
 */
describe('the request LangChain builds', () => {
  const schema = z.object({ answer: z.string() });

  function recordingFetch(sink: { body?: Record<string, unknown> | null }) {
    return (async (_url: unknown, init?: { body?: string }) => {
      sink.body = init?.body ? JSON.parse(init.body) : null;
      throw new Error('intercepted before leaving the machine');
    }) as unknown as typeof fetch;
  }

  async function bodyFor(
    build: (fetchImpl: typeof fetch) => { withStructuredOutput: ChatOpenAI['withStructuredOutput'] },
    config: Record<string, unknown>,
  ) {
    const sink: { body?: Record<string, unknown> | null } = {};
    const llm = build(recordingFetch(sink));
    await llm
      .withStructuredOutput(schema, { includeRaw: true, name: 'navigator_output', ...config })
      .invoke('hi')
      .catch(() => {});
    return sink.body;
  }

  const openAI = (fetchImpl: typeof fetch) =>
    new ChatOpenAI({
      model: 'stepfun/step-3.5-flash',
      apiKey: 'test',
      maxRetries: 0,
      configuration: { fetch: fetchImpl },
    });

  const anthropic = (fetchImpl: typeof fetch) =>
    new ChatAnthropic({
      model: 'claude-sonnet-4-5',
      apiKey: 'test',
      maxRetries: 0,
      clientOptions: { fetch: fetchImpl },
    });

  it.each([
    ['ChatOpenAI', openAI],
    ['ChatAnthropic', anthropic],
  ])('sends an identical body from %s whether method is omitted or explicitly undefined', async (_name, build) => {
    const omitted = await bodyFor(build, {});
    const explicitlyUndefined = await bodyFor(build, { method: undefined });

    expect(omitted).toBeTruthy();
    expect(explicitlyUndefined).toEqual(omitted);
  });

  // The failure that started all of this, reproduced at the wire: `response_format` is exactly the
  // parameter OpenRouter reports stepfun/step-3.5-flash does not accept.
  it('leads with response_format: json_schema on an OpenAI-compatible client', async () => {
    const body = await bodyFor(openAI, {});

    expect(body?.response_format).toMatchObject({ type: 'json_schema' });
    expect(body?.tools).toBeUndefined();
  });

  it('carries tools and tool_choice instead once the fallback kicks in', async () => {
    const body = await bodyFor(openAI, { method: 'functionCalling' });

    expect(body?.response_format).toBeUndefined();
    expect(body?.tools).toHaveLength(1);
    expect(body?.tool_choice).toMatchObject({ type: 'function', function: { name: 'navigator_output' } });
  });

  // Which is why anthropic is on PROVIDERS_ALREADY_TOOL_CALLING: the retry would resend this.
  it('shows Anthropic already leading with tools, so retrying it would change nothing', async () => {
    const body = await bodyFor(anthropic, {});

    expect(body?.tools).toHaveLength(1);
    expect(body?.response_format).toBeUndefined();
  });
});
