import { type ProviderConfig, type ModelConfig, ProviderTypeEnum } from '@extension/storage';
import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatXAI } from '@langchain/xai';
import { ChatGroq } from '@langchain/groq';
import { ChatCerebras } from '@langchain/cerebras';
import { ChatOllama } from '@langchain/ollama';
import { ChatDeepSeek } from '@langchain/deepseek';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Output cap handed to every provider client. Exported because a request is input + output against
 * one context window, so the input budget has to hold this back.
 */
export const OUTPUT_TOKEN_CAP = 1024 * 4;

/**
 * Context window requested from Ollama, and therefore the real ceiling for a model served by it.
 *
 * Not raised to match the agent's own budget on purpose: `num_ctx` makes Ollama allocate a KV cache
 * that size and rope-scale a model trained on less, which degrades the model to buy room it does not
 * have. So the budget comes down to meet this instead - see `contextWindowFor`.
 */
export const OLLAMA_CONTEXT_TOKENS = 64000;

/**
 * The hard context ceiling a provider imposes, where we set one ourselves.
 *
 * Only Ollama has one here, because only Ollama is told its window by this code. For everyone else
 * the window belongs to the model and the user's `maxInputTokens` is the only stated limit - we do
 * not ship a per-model table, and a stale table would refuse budgets that are in fact fine.
 *
 * This matters because a budget above the real window is not a soft overrun: Ollama does not answer
 * with an error, it truncates the prompt from the front and answers anyway. The front is where the
 * system prompt and the pinned task live, so the agent loses its instructions and its output format
 * mid-run with nothing at all to say why.
 */
export function contextWindowFor(provider: string): number | undefined {
  return provider === ProviderTypeEnum.Ollama ? OLLAMA_CONTEXT_TOKENS : undefined;
}
const maxTokens = OUTPUT_TOKEN_CAP;

/**
 * Claude models that reject `temperature`, `top_p` and `top_k` with a 400.
 *
 * Matched by family rather than by an allowlist of ids, because the model field is free text: a
 * name this does not recognise is assumed to take sampling parameters, which is the behaviour every
 * older Claude model wants and the one that was correct before these families existed.
 */
export function isSamplingRemovedClaudeModel(modelName: string): boolean {
  const name = modelName.toLowerCase();
  return (
    name.includes('opus-5') ||
    name.includes('opus-4-8') ||
    name.includes('opus-4-7') ||
    name.includes('sonnet-5') ||
    name.includes('fable-5') ||
    name.includes('mythos-5')
  );
}

/**
 * Retries are owned by the agent's own `callWithRetry`, not by LangChain.
 *
 * `AsyncCaller` in @langchain/core 0.3.79 defaults to six retries with its own 1s exponential
 * backoff (`factor: 2`, `minTimeout: 1000`, `randomize: true`), and every model built below except
 * ChatOllama routes its request through it - the provider SDKs' own retry is already off
 * (`maxRetries: 0` inside @langchain/openai and @langchain/anthropic). Left alone, one rate-limited
 * step means six invisible retries and up to two minutes of silence, and stacking our own on top
 * would make it twenty-one requests. Turning it off here makes our retry the only one, so the
 * budget, the jitter and the abort behaviour all live in one readable place - and it gives
 * ChatOllama the retries it never had, since `ChatOllama._generate` talks to the Ollama client
 * directly and never touches AsyncCaller at all.
 */
const RETRY_OWNED_BY_AGENT = { maxRetries: 0 } as const;

/** The subset of the Llama API response this module reads. */
type LlamaCompletionResponse = {
  id?: string;
  metrics?: Array<{ metric: string; value: number }>;
  completion_message: {
    content: { text: string };
    stop_reason?: string;
  };
};

/** The OpenAI-shaped completion LangChain's ChatOpenAI expects back. */
type OpenAIChatCompletion = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/** Reshape a Llama API response into the OpenAI shape LangChain expects. */
function toOpenAIChatCompletion(response: LlamaCompletionResponse, model: string): OpenAIChatCompletion {
  const metric = (name: string) => response.metrics?.find(m => m.metric === name)?.value || 0;
  return {
    id: response.id || 'llama-response',
    object: 'chat.completion',
    created: Date.now(),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: response.completion_message.content.text,
        },
        finish_reason: response.completion_message.stop_reason || 'stop',
      },
    ],
    usage: {
      prompt_tokens: metric('num_prompt_tokens'),
      completion_tokens: metric('num_completion_tokens'),
      total_tokens: metric('num_total_tokens'),
    },
  };
}

/**
 * ChatOpenAI speaking to the Llama API, which answers with `completion_message` instead of `choices`.
 *
 * The transformation has to be installed on the internal completions client rather than overridden on
 * this class: since @langchain/openai 0.6, ChatOpenAI delegates generation to `this.completions`, so a
 * `completionWithRetry` method defined here is never called. Patching the delegate is what keeps the
 * conversion on the path the request actually takes.
 */
/**
 * The private delegate ChatOpenAI routes generation through. It is not part of the
 * published type surface, so it is described here rather than imported.
 */
type CompletionsDelegate = {
  completionWithRetry: (request: { model: string }, options?: unknown) => Promise<unknown>;
};

/** Narrow an unknown response to the Llama shape without asserting it. */
function isLlamaCompletion(value: unknown): value is LlamaCompletionResponse {
  return typeof (value as LlamaCompletionResponse | null)?.completion_message?.content?.text === 'string';
}

class ChatLlama extends ChatOpenAI {
  constructor(args: ConstructorParameters<typeof ChatOpenAI>[0]) {
    super(args);

    // `completions` is the delegate ChatOpenAI routes every request through
    const completions = (this as unknown as { completions?: Partial<CompletionsDelegate> }).completions;
    if (!completions || typeof completions.completionWithRetry !== 'function') {
      console.error('[ChatLlama] Could not install the Llama response transform: no completions delegate found');
      return;
    }

    const original = completions.completionWithRetry.bind(completions) as CompletionsDelegate['completionWithRetry'];
    completions.completionWithRetry = async (request, options) => {
      try {
        const response = await original(request, options);
        return isLlamaCompletion(response) ? toOpenAIChatCompletion(response, request.model) : response;
      } catch (error) {
        console.error('[ChatLlama] Error during API call:', error);
        throw error;
      }
    };
  }
}

// O series models or GPT-5 models that support reasoning
function isOpenAIReasoningModel(modelName: string): boolean {
  let modelNameWithoutProvider = modelName;
  if (modelName.startsWith('openai/')) {
    modelNameWithoutProvider = modelName.substring(7);
  }
  return (
    modelNameWithoutProvider.startsWith('o') ||
    (modelNameWithoutProvider.startsWith('gpt-5') && !modelNameWithoutProvider.startsWith('gpt-5-chat'))
  );
}

function createOpenAIChatModel(
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  // Add optional extra fetch options for headers etc.
  extraFetchOptions: { headers?: Record<string, string> } | undefined,
): BaseChatModel {
  const args: {
    model: string;
    apiKey?: string;
    // Configuration should align with ClientOptions from @langchain/openai
    configuration?: Record<string, unknown>;
    modelKwargs?: {
      max_completion_tokens: number;
      reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
    };
    topP?: number;
    temperature?: number;
    maxTokens?: number;
    maxRetries: number;
  } = {
    ...RETRY_OWNED_BY_AGENT,
    model: modelConfig.modelName,
    apiKey: providerConfig.apiKey,
  };

  const configuration: Record<string, unknown> = {};
  if (providerConfig.baseUrl) {
    configuration.baseURL = providerConfig.baseUrl;
  }
  if (extraFetchOptions?.headers) {
    configuration.defaultHeaders = extraFetchOptions.headers;
  }
  args.configuration = configuration;

  // custom provider may have no api key
  if (providerConfig.apiKey) {
    args.apiKey = providerConfig.apiKey;
  }

  // O series models have different parameters
  if (isOpenAIReasoningModel(modelConfig.modelName)) {
    args.modelKwargs = {
      max_completion_tokens: maxTokens,
    };

    // Add reasoning_effort parameter for o-series models if specified
    if (modelConfig.reasoningEffort) {
      // if it's gpt-5.1, we need to convert minimal to none, it doesn't support minimal
      if (modelConfig.modelName.includes('gpt-5.1') && modelConfig.reasoningEffort === 'minimal') {
        args.modelKwargs.reasoning_effort = 'none';
      } else {
        args.modelKwargs.reasoning_effort = modelConfig.reasoningEffort;
      }
    }
  } else {
    args.topP = (modelConfig.parameters?.topP ?? 0.1) as number;
    args.temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
    args.maxTokens = maxTokens;
  }
  return new ChatOpenAI(args);
}

// Function to extract instance name from Azure endpoint URL
function extractInstanceNameFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const hostnameParts = parsedUrl.hostname.split('.');
    // Expecting format like instance-name.openai.azure.com
    if (hostnameParts.length >= 4 && hostnameParts[1] === 'openai' && hostnameParts[2] === 'azure') {
      return hostnameParts[0];
    }
  } catch (e) {
    console.error('Error parsing Azure endpoint URL:', e);
  }
  return null;
}

// Function to check if a provider ID is an Azure provider
function isAzureProvider(providerId: string): boolean {
  return providerId === ProviderTypeEnum.AzureOpenAI || providerId.startsWith(`${ProviderTypeEnum.AzureOpenAI}_`);
}

// Function to create an Azure OpenAI chat model
function createAzureChatModel(providerConfig: ProviderConfig, modelConfig: ModelConfig): BaseChatModel {
  const temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
  const topP = (modelConfig.parameters?.topP ?? 0.1) as number;

  // Validate necessary fields first
  if (
    !providerConfig.baseUrl ||
    !providerConfig.azureDeploymentNames ||
    providerConfig.azureDeploymentNames.length === 0 ||
    !providerConfig.azureApiVersion ||
    !providerConfig.apiKey
  ) {
    throw new Error(
      'Azure configuration is incomplete. Endpoint, Deployment Name, API Version, and API Key are required. Please check settings.',
    );
  }

  // Instead of always using the first deployment name, use the model name from modelConfig
  // which contains the actual model selected in the UI
  const deploymentName = modelConfig.modelName;

  // Validate that the selected model exists in the configured deployments
  if (!providerConfig.azureDeploymentNames.includes(deploymentName)) {
    console.warn(
      `[createChatModel] Selected deployment "${deploymentName}" not found in available deployments. ` +
        `Available: ${JSON.stringify(providerConfig.azureDeploymentNames)}. Using the model anyway.`,
    );
  }

  // Extract instance name from the endpoint URL
  const instanceName = extractInstanceNameFromUrl(providerConfig.baseUrl);
  if (!instanceName) {
    throw new Error(
      `Could not extract Instance Name from Azure Endpoint URL: ${providerConfig.baseUrl}. Expected format like https://<your-instance-name>.openai.azure.com/`,
    );
  }

  // Check if the Azure deployment is using an "o" series model (GPT-4o, etc.)
  const isOSeriesModel = isOpenAIReasoningModel(deploymentName);

  // Use AzureChatOpenAI with specific parameters
  const args = {
    ...RETRY_OWNED_BY_AGENT,
    azureOpenAIApiInstanceName: instanceName, // Derived from endpoint
    azureOpenAIApiDeploymentName: deploymentName,
    azureOpenAIApiKey: providerConfig.apiKey,
    azureOpenAIApiVersion: providerConfig.azureApiVersion,
    // For Azure, the model name should be the deployment name itself
    model: deploymentName, // Set model = deployment name to fix Azure requests
    // For O series models, use modelKwargs instead of temperature/topP
    ...(isOSeriesModel
      ? {
          modelKwargs: {
            max_completion_tokens: maxTokens,
            // Add reasoning_effort parameter for Azure o-series models if specified
            ...(modelConfig.reasoningEffort ? { reasoning_effort: modelConfig.reasoningEffort } : {}),
          },
        }
      : {
          temperature,
          topP,
          maxTokens,
        }),
    // DO NOT pass baseUrl or configuration here
  };
  // console.log('[createChatModel] Azure args passed to AzureChatOpenAI:', args);
  return new AzureChatOpenAI(args);
}

// create a chat model based on the agent name, the model name and provider
export function createChatModel(providerConfig: ProviderConfig, modelConfig: ModelConfig): BaseChatModel {
  const temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
  const topP = (modelConfig.parameters?.topP ?? 0.1) as number;

  // Check if the provider is an Azure provider with a custom ID (e.g. azure_openai_2)
  const isAzure = isAzureProvider(modelConfig.provider);

  // If this is any type of Azure provider, handle it with the dedicated function
  if (isAzure) {
    return createAzureChatModel(providerConfig, modelConfig);
  }

  switch (modelConfig.provider) {
    case ProviderTypeEnum.OpenAI: {
      // Call helper without extra options
      return createOpenAIChatModel(providerConfig, modelConfig, undefined);
    }
    case ProviderTypeEnum.Anthropic: {
      // Older Claude models take temperature; current ones reject it outright.
      //
      // Sampling parameters were removed from Opus 5, Opus 4.8, Opus 4.7, Sonnet 5 and Fable 5 -
      // `temperature`, `top_p` and `top_k` all return 400 there, while Opus 4.6 / Sonnet 4.6 and
      // earlier still accept them. Model names are free text in the options UI, so the only way to
      // reach a current model is to type one, and every request then failed on the first step.
      //
      // Suppressing them takes `invocationKwargs` rather than `temperature: null`, because the
      // client fills `top_p` and `top_k` from its own defaults for any model outside a hardcoded
      // 4.1/4.5 list - verified: `claude-opus-5` otherwise goes out carrying
      // `{temperature: 0.1, top_p: -1, top_k: -1}`. `invocationKwargs` is spread last into the
      // request body, and JSON.stringify drops the undefined keys.
      const takesSamplingParams = !isSamplingRemovedClaudeModel(modelConfig.modelName);
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        maxTokens,
        ...(takesSamplingParams
          ? { temperature }
          : {
              temperature: null,
              invocationKwargs: { temperature: undefined, top_p: undefined, top_k: undefined },
            }),
        clientOptions: {},
      };
      return new ChatAnthropic(args);
    }
    case ProviderTypeEnum.DeepSeek: {
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        temperature,
        topP,
      };
      return new ChatDeepSeek(args) as BaseChatModel;
    }
    case ProviderTypeEnum.Gemini: {
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        temperature,
        topP,
      };
      return new ChatGoogleGenerativeAI(args);
    }
    case ProviderTypeEnum.Grok: {
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        temperature,
        topP,
        maxTokens,
        configuration: {},
      };
      return new ChatXAI(args) as BaseChatModel;
    }
    case ProviderTypeEnum.Groq: {
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        temperature,
        topP,
        maxTokens,
      };
      return new ChatGroq(args);
    }
    case ProviderTypeEnum.Cerebras: {
      const args = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        temperature,
        topP,
        maxTokens,
      };
      return new ChatCerebras(args);
    }
    case ProviderTypeEnum.Ollama: {
      const args: {
        model: string;
        apiKey?: string;
        baseUrl: string;
        modelKwargs?: { max_completion_tokens: number };
        topP?: number;
        temperature?: number;
        maxTokens?: number;
        numCtx: number;
        maxRetries: number;
      } = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        // required but ignored by ollama
        apiKey: providerConfig.apiKey === '' ? 'ollama' : providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl ?? 'http://localhost:11434',
        topP,
        temperature,
        maxTokens,
        // ollama usually has a very small context window, so we need to set a large number for agent to work
        // It was set to 128000 in the original code, but it will cause ollama reload the models frequently if you have multiple models working together
        // not sure why, but setting it to 64000 seems to work fine
        // TODO: configure the context window size in model config
        numCtx: OLLAMA_CONTEXT_TOKENS,
      };
      return new ChatOllama(args);
    }
    case ProviderTypeEnum.OpenRouter: {
      // Call the helper function, passing OpenRouter headers via the third argument
      return createOpenAIChatModel(providerConfig, modelConfig, {
        headers: {
          'HTTP-Referer': 'https://flowkite.vercel.app',
          'X-Title': 'Flowkite',
        },
      });
    }
    case ProviderTypeEnum.Llama: {
      // Llama API has a different response format, use custom ChatLlama class
      const args: {
        model: string;
        apiKey?: string;
        configuration?: Record<string, unknown>;
        topP?: number;
        temperature?: number;
        maxTokens?: number;
        maxRetries: number;
      } = {
        ...RETRY_OWNED_BY_AGENT,
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        topP: (modelConfig.parameters?.topP ?? 0.1) as number,
        temperature: (modelConfig.parameters?.temperature ?? 0.1) as number,
        maxTokens,
      };

      const configuration: Record<string, unknown> = {};
      if (providerConfig.baseUrl) {
        configuration.baseURL = providerConfig.baseUrl;
      }
      args.configuration = configuration;

      return new ChatLlama(args);
    }
    default: {
      // by default, we think it's a openai-compatible provider
      // Pass undefined for extraFetchOptions for default/custom cases
      return createOpenAIChatModel(providerConfig, modelConfig, undefined);
    }
  }
}
