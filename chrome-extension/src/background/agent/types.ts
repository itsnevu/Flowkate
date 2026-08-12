import { z } from 'zod';
import { DEFAULT_INCLUDE_ATTRIBUTES } from '../browser/dom/views';
import { Actors, ExecutionState, type ActionConfirmationPayload, type EventPayload, AgentEvent } from './event/types';
import { AgentStepHistory } from './history';
import type BrowserContext from '../browser/context';
import type { DOMHistoryElement } from '../browser/dom/history/view';
import type MessageManager from './messages/service';
import type { EventManager } from './event/manager';

export interface AgentOptions {
  maxSteps: number;
  maxActionsPerStep: number;
  maxFailures: number;
  retryDelay: number;
  maxInputTokens: number;
  maxErrorLength: number;
  useVision: boolean;
  useVisionForPlanner: boolean;
  includeAttributes: string[];
  planningInterval: number;
  /** Ask the user to confirm before running an action that spends money, deletes data, etc. */
  confirmSensitiveActions: boolean;
}

export const DEFAULT_AGENT_OPTIONS: AgentOptions = {
  maxSteps: 100,
  maxActionsPerStep: 10,
  maxFailures: 3,
  retryDelay: 10,
  maxInputTokens: 128000,
  maxErrorLength: 400,
  useVision: false,
  useVisionForPlanner: true,
  includeAttributes: DEFAULT_INCLUDE_ATTRIBUTES,
  planningInterval: 3,
  confirmSensitiveActions: true,
};

export class AgentContext {
  controller: AbortController;
  taskId: string;
  browserContext: BrowserContext;
  messageManager: MessageManager;
  eventManager: EventManager;
  options: AgentOptions;
  paused: boolean;
  stopped: boolean;
  consecutiveFailures: number;
  nSteps: number;
  stepInfo: AgentStepInfo | null;
  actionResults: ActionResult[];
  stateMessageAdded: boolean;
  history: AgentStepHistory;
  finalAnswer: string | null;
  /** Resolver for the pending sensitive-action gate, set only while the user is being asked. */
  private actionConfirmationResolver: ((approved: boolean) => void) | null = null;

  constructor(
    taskId: string,
    browserContext: BrowserContext,
    messageManager: MessageManager,
    eventManager: EventManager,
    options: Partial<AgentOptions>,
  ) {
    this.controller = new AbortController();
    this.taskId = taskId;
    this.browserContext = browserContext;
    this.messageManager = messageManager;
    this.eventManager = eventManager;
    this.options = { ...DEFAULT_AGENT_OPTIONS, ...options };

    this.paused = false;
    this.stopped = false;
    this.nSteps = 0;
    this.consecutiveFailures = 0;
    this.stepInfo = null;
    this.actionResults = [];
    this.stateMessageAdded = false;
    this.history = new AgentStepHistory();
    this.finalAnswer = null;
  }

  async emitEvent(actor: Actors, state: ExecutionState, eventDetails: string, payload?: EventPayload) {
    const event = new AgentEvent(actor, state, {
      taskId: this.taskId,
      step: this.nSteps,
      maxSteps: this.options.maxSteps,
      details: eventDetails,
      payload,
    });
    await this.eventManager.emit(event);
  }

  /**
   * Block until the user explicitly allows a sensitive action, or declines it.
   *
   * The agent is genuinely parked here — nothing reaches the page until an answer comes back — so a
   * page that manages to steer the model still cannot spend money or delete data on its own.
   */
  async requestActionConfirmation(request: ActionConfirmationPayload): Promise<boolean> {
    await this.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_CONFIRM, request.description, request);
    const approved = await new Promise<boolean>(resolve => {
      this.actionConfirmationResolver = resolve;
    });
    this.actionConfirmationResolver = null;
    return approved;
  }

  /** Resolve a pending sensitive-action gate. No-op if the agent is not waiting on one. */
  resolveActionConfirmation(approved: boolean): void {
    this.actionConfirmationResolver?.(approved);
  }

  /** Whether the agent is currently blocked waiting for the user to confirm an action. */
  isAwaitingActionConfirmation(): boolean {
    return this.actionConfirmationResolver !== null;
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
  }

  async stop() {
    this.stopped = true;
    // release any pending confirmation gate, otherwise the navigator stays parked on it forever
    this.actionConfirmationResolver?.(false);
    setTimeout(() => this.controller.abort(), 300);
  }
}

export class AgentStepInfo {
  stepNumber: number;
  maxSteps: number;

  constructor(params: { stepNumber: number; maxSteps: number }) {
    this.stepNumber = params.stepNumber;
    this.maxSteps = params.maxSteps;
  }
}

export class ActionResult {
  isDone: boolean;
  success: boolean;
  extractedContent: string | null;
  error: string | null;
  includeInMemory: boolean;
  interactedElement: DOMHistoryElement | null;

  constructor(params: Partial<ActionResult> = {}) {
    this.isDone = params.isDone ?? false;
    this.success = params.success ?? false;
    this.interactedElement = params.interactedElement ?? null;
    this.extractedContent = params.extractedContent ?? null;
    this.error = params.error ?? null;
    this.includeInMemory = params.includeInMemory ?? false;
  }
}

export type WrappedActionResult = ActionResult & {
  toolCallId: string;
};

export class StepMetadata {
  stepStartTime: number;
  stepEndTime: number;
  inputTokens: number;
  stepNumber: number;

  constructor(stepStartTime: number, stepEndTime: number, inputTokens: number, stepNumber: number) {
    this.stepStartTime = stepStartTime;
    this.stepEndTime = stepEndTime;
    this.inputTokens = inputTokens;
    this.stepNumber = stepNumber;
  }

  /**
   * Calculate step duration in seconds
   */
  get durationSeconds(): number {
    return this.stepEndTime - this.stepStartTime;
  }
}

export const agentBrainSchema = z
  .object({
    evaluation_previous_goal: z.string(),
    memory: z.string(),
    next_goal: z.string(),
  })
  .describe('Current state of the agent');

export type AgentBrain = z.infer<typeof agentBrainSchema>;

// Make AgentOutput generic with Zod schema
export interface AgentOutput<T = unknown> {
  /**
   * The unique identifier for the agent
   */
  id: string;

  /**
   * The result of the agent's step
   */
  result?: T;
  /**
   * The error that occurred during the agent's action
   */
  error?: string;
}
