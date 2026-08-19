import { t } from '@extension/i18n';
import { createLogger } from '@src/background/log';
import { ProviderTypeEnum } from '@extension/storage';
import { convertInputMessages, extractJsonFromModelOutput, removeThinkTags } from '../messages/utils';
import { Actors, ExecutionState } from '../event/types';
import { readUsage } from '../usage';
import { extractStatusCode, isAbortedError, isBadRequestError, ResponseParseError } from './errors';
import { callWithRetry } from './retry';
import type { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgentContext, AgentOutput } from '../types';
import type { BasePrompt } from '../prompts/base';
import type { BaseMessage } from '@langchain/core/messages';
import type { Action } from '../actions/builder';

const logger = createLogger('agent');

/** How a structured-output request is put to the provider. */
type StructuredOutputMethod = 'functionCalling';

/**
 * What `withStructuredOutput(..., {includeRaw: true})` resolves to. Named rather than written
 * inline because `this['ModelOutput']` is not allowed inside an anonymous object type.
 */
type StructuredResponse<M> = { raw: BaseMessage; parsed: M | null };

/**
 * Models whose provider answered LangChain's default structured-output request with a 400.
 *
 * ChatOpenAI picks `response_format: {type: 'json_schema'}` for every model whose name is not a
 * gpt-3/gpt-4 string, which is wrong for the many OpenRouter models that advertise `tools` but not
 * `response_format` - stepfun/step-3.5-flash among them. The first task on such a model pays one
 * rejected request to find that out; this set is module-scoped so later tasks do not, since the
 * agents themselves are rebuilt for every task. Keyed by provider as well as model, because the
 * same model id can be served by two endpoints that differ on this.
 */
const modelsNeedingToolCalling = new Set<string>();

/**
 * Provider types whose LangChain client already leads with tool calling.
 *
 * Retrying one of these under `functionCalling` would repeat the identical request, so a 400 from
 * them would be answered by a second 400 and nothing else: a wasted call against the user's quota
 * and twice the wait before they see what actually went wrong. Everything not listed here leads
 * with a JSON-schema response format - ChatOpenAI and Gemini send `response_format`, Ollama sends
 * `format: 'json'` - which is the case the fallback exists for.
 *
 * Read off the installed clients: @langchain/anthropic 0.3.33, xai 0.1.0, deepseek 0.1.0,
 * cerebras 0.0.4 and groq 0.2.4 each either default `method` to 'functionCalling' outright or
 * branch to tool calling for anything that is not 'jsonMode'. Being wrong here is not dangerous -
 * a missing entry costs one extra request on a path that has already failed - so it does not need
 * to track every future version exactly.
 */
const PROVIDERS_ALREADY_TOOL_CALLING = new Set<string>([
  ProviderTypeEnum.Anthropic,
  ProviderTypeEnum.Grok,
  ProviderTypeEnum.DeepSeek,
  ProviderTypeEnum.Cerebras,
  ProviderTypeEnum.Groq,
]);

/**
 * Whether a failed call looks like the provider refusing the default structured-output format.
 *
 * A 400 is the whole of the signal: OpenRouter forwards an upstream rejection as a bare
 * "400 Provider returned error" that names no parameter, and `isBadRequestError` looks for ' 400'
 * with a leading space, which that message does not have. So the status on the SDK error is what
 * classifies it here, and the message-shaped check is left in only for clients that attach none.
 */
function isFormatRejection(error: unknown): boolean {
  return extractStatusCode(error) === 400 || isBadRequestError(error);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CallOptions = Record<string, any>;

// Update options to use Zod schema
export interface BaseAgentOptions {
  chatLLM: BaseChatModel;
  context: AgentContext;
  prompt: BasePrompt;
  provider?: string;
}
export interface ExtraAgentOptions {
  id?: string;
  callOptions?: CallOptions;
}

/**
 * Base class for all agents
 * @param T - The Zod schema for the model output
 * @param M - The type of the result field of the agent output
 */
export abstract class BaseAgent<T extends z.ZodType, M = unknown> {
  protected id: string;
  protected chatLLM: BaseChatModel;
  protected prompt: BasePrompt;
  protected context: AgentContext;
  protected actions: Record<string, Action> = {};
  protected modelOutputSchema: T;
  protected modelName: string;
  protected provider: string;
  protected withStructuredOutput: boolean;
  protected callOptions?: CallOptions;
  protected modelOutputToolName: string;
  declare ModelOutput: z.infer<T>;

  constructor(modelOutputSchema: T, options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    // base options
    this.modelOutputSchema = modelOutputSchema;
    this.chatLLM = options.chatLLM;
    this.prompt = options.prompt;
    this.context = options.context;
    this.provider = options.provider || '';
    this.modelName = this.getModelName();
    this.withStructuredOutput = this.setWithStructuredOutput();
    // extra options
    this.id = extraOptions?.id || 'agent';
    this.callOptions = extraOptions?.callOptions;
    this.modelOutputToolName = `${this.id}_output`;
  }

  // Set the model name
  private getModelName(): string {
    if ('modelName' in this.chatLLM) {
      return this.chatLLM.modelName as string;
    }
    if ('model_name' in this.chatLLM) {
      return this.chatLLM.model_name as string;
    }
    if ('model' in this.chatLLM) {
      return this.chatLLM.model as string;
    }
    return 'Unknown';
  }

  // Check if model is a Llama model (only for Llama-specific handling)
  private isLlamaModel(modelName: string): boolean {
    return modelName.includes('Llama-4') || modelName.includes('Llama-3.3') || modelName.includes('llama-3.3');
  }

  // Set whether to use structured output based on the model name
  private setWithStructuredOutput(): boolean {
    if (this.modelName === 'deepseek-reasoner' || this.modelName === 'deepseek-r1') {
      return false;
    }

    // Llama API models don't support json_schema response format
    if (this.provider === ProviderTypeEnum.Llama || this.isLlamaModel(this.modelName)) {
      logger.debug(`[${this.modelName}] Llama API doesn't support structured output, using manual JSON extraction`);
      return false;
    }

    return true;
  }

  /** Which actor this agent reports as in the event stream. Subclasses that emit override it. */
  protected get eventActor(): Actors {
    return Actors.SYSTEM;
  }

  /**
   * Run one model call, trying again when the failure was the network or the provider rather than
   * the request.
   *
   * This wraps the call itself rather than the whole of invoke() on purpose: both paths below
   * rewrap failures into a plain `Error` whose message no longer carries `status`, so a retry layer
   * any further out could only guess from text.
   */
  protected async callModelWithRetry<T>(call: () => Promise<T>): Promise<T> {
    return callWithRetry(call, {
      signal: this.context.controller.signal,
      capMs: this.context.options.retryDelay * 1000,
      onRetry: (attempt, maxAttempts, delayMs, error) => {
        logger.warning(
          `[${this.modelName}] attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${error.message}`,
        );
        this.context.emitEvent(
          this.eventActor,
          ExecutionState.STEP_RETRY,
          t('exec_llm_retry', [String(attempt), String(maxAttempts - 1), String(Math.ceil(delayMs / 1000))]),
        );
      },
    });
  }

  /**
   * One structured-output call, retried under tool calling when the provider rejects the format
   * LangChain chose.
   *
   * The first attempt passes no `method`, so every provider keeps the default it has always used
   * here. Tool calling is the wider of the two formats - a model that takes a JSON schema in
   * `response_format` almost always takes one in `tools` as well, and OpenRouter lists plenty that
   * take only the latter - which makes it the thing to fall back to rather than the thing to lead
   * with. The fallback is remembered only once it works, so a 400 about the request itself (an
   * oversized context, an image a text-only model cannot read) is still reported as itself.
   */
  protected async invokeStructured(
    schema: T | Record<string, unknown>,
    inputMessages: BaseMessage[],
  ): Promise<StructuredResponse<this['ModelOutput']>> {
    const call = (method: StructuredOutputMethod | undefined) =>
      this.callModelWithRetry(() =>
        this.chatLLM
          .withStructuredOutput(schema, { includeRaw: true, name: this.modelOutputToolName, method })
          .invoke(inputMessages, {
            signal: this.context.controller.signal,
            ...this.callOptions,
          }),
      ) as Promise<StructuredResponse<this['ModelOutput']>>;

    const modelKey = `${this.provider}:${this.modelName}`;
    if (modelsNeedingToolCalling.has(modelKey)) {
      return call('functionCalling');
    }

    try {
      return await call(undefined);
    } catch (error) {
      if (isAbortedError(error) || !isFormatRejection(error) || PROVIDERS_ALREADY_TOOL_CALLING.has(this.provider)) {
        throw error;
      }
      logger.warning(`[${this.modelName}] rejected the default structured output, retrying with tool calling`);
      let response: StructuredResponse<this['ModelOutput']>;
      try {
        response = await call('functionCalling');
      } catch (fallbackError) {
        // The format was not what the 400 was about, so the first error is the one that says why.
        throw isAbortedError(fallbackError) ? fallbackError : error;
      }
      modelsNeedingToolCalling.add(modelKey);
      return response;
    }
  }

  async invoke(inputMessages: BaseMessage[]): Promise<this['ModelOutput']> {
    // Use structured output
    if (this.withStructuredOutput) {
      logger.debug(`[${this.modelName}] Preparing structured output call with schema:`, {
        schemaName: this.modelOutputToolName,
        messageCount: inputMessages.length,
        modelProvider: this.provider,
      });

      let response = undefined;
      try {
        logger.debug(`[${this.modelName}] Invoking LLM with structured output...`);
        response = await this.invokeStructured(this.modelOutputSchema, inputMessages);
        // before the parsed/unparsed branch: a call that returned unusable JSON still cost money,
        // and that is exactly when you want to know it did
        this.recordUsage(response.raw);

        logger.debug(`[${this.modelName}] LLM response received:`, {
          hasParsed: !!response.parsed,
          hasRaw: !!response.raw,
          rawContent: response.raw?.content?.slice(0, 500) + (response.raw?.content?.length > 500 ? '...' : ''),
        });

        if (response.parsed) {
          logger.debug(`[${this.modelName}] Successfully parsed structured output`);
          return response.parsed;
        }
        logger.error('Failed to parse response', response);
        throw new Error('Could not parse response with structured output');
      } catch (error) {
        if (isAbortedError(error)) {
          throw error;
        }

        // Try to extract JSON from raw response manually if possible
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('is not valid JSON') &&
          response?.raw?.content &&
          typeof response.raw.content === 'string'
        ) {
          const parsed = this.manuallyParseResponse(response.raw.content);
          if (parsed) {
            return parsed;
          }
        }
        logger.error(`[${this.modelName}] LLM call failed with error: \n${errorMessage}`);
        throw new Error(`Failed to invoke ${this.modelName} with structured output: \n${errorMessage}`);
      }
    }

    // Fallback: Without structured output support, need to extract JSON from model output manually
    logger.debug(`[${this.modelName}] Using manual JSON extraction fallback method`);
    const convertedInputMessages = convertInputMessages(inputMessages, this.modelName);

    try {
      const response = await this.callModelWithRetry(() =>
        this.chatLLM.invoke(convertedInputMessages, {
          signal: this.context.controller.signal,
          ...this.callOptions,
        }),
      );
      // this path gets the AIMessage directly rather than a {raw, parsed} wrapper; readUsage reads
      // usage_metadata off either shape
      this.recordUsage(response);

      if (typeof response.content === 'string') {
        const parsed = this.manuallyParseResponse(response.content);
        if (parsed) {
          return parsed;
        }
      }
    } catch (error) {
      logger.error(`[${this.modelName}] LLM call failed in manual extraction mode:`, error);
      throw error;
    }
    const errorMessage = `Failed to parse response from ${this.modelName}`;
    logger.error(errorMessage);
    throw new ResponseParseError('Could not parse response');
  }

  // Execute the agent and return the result
  abstract execute(): Promise<AgentOutput<M>>;

  // Helper method to validate metadata
  protected validateModelOutput(data: unknown): this['ModelOutput'] | undefined {
    if (!this.modelOutputSchema || !data) return undefined;
    try {
      return this.modelOutputSchema.parse(data);
    } catch (error) {
      logger.error('validateModelOutput', error);
      throw new ResponseParseError('Could not validate model output');
    }
  }

  /**
   * Record what a model call actually cost, using the provider's own numbers.
   *
   * Never falls back to the character-count estimate in MessageManager: mixing measured and guessed
   * tokens in one total makes the total a lie. A provider that reports nothing is counted as
   * unreported instead, so the UI can say the number is a floor.
   */
  protected recordUsage(raw: unknown): void {
    const usage = readUsage(raw);
    this.context.tokenUsage.record(this.id, this.modelName, usage);
    if (usage) {
      void this.context.emitEvent(
        Actors.SYSTEM,
        ExecutionState.TASK_USAGE,
        String(usage.total_tokens ?? 0),
        this.context.tokenUsage.snapshot(),
      );
    }
  }

  // Helper method to manually parse the response content
  protected manuallyParseResponse(content: string): this['ModelOutput'] | undefined {
    const cleanedContent = removeThinkTags(content);
    try {
      const extractedJson = extractJsonFromModelOutput(cleanedContent);
      return this.validateModelOutput(extractedJson);
    } catch (error) {
      logger.warning('manuallyParseResponse failed', error);
      return undefined;
    }
  }
}
