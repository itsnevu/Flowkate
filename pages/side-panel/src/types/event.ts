import type { Actors } from '@extension/storage';

export enum EventType {
  /**
   * Type of events that can be subscribed to.
   *
   * For now, only execution events are supported.
   */
  EXECUTION = 'execution',
}

export enum ExecutionState {
  /**
   * States representing different phases in the execution lifecycle.
   *
   * Format: <SCOPE>.<STATUS>
   * Scopes: task, step, act
   * Statuses: start, ok, fail, cancel
   *
   * Examples:
   *     TASK_OK = "task.ok"  // Task completed successfully
   *     STEP_FAIL = "step.fail"  // Step failed
   *     ACT_START = "act.start"  // Action started
   */
  // Task level states
  TASK_START = 'task.start',
  TASK_OK = 'task.ok',
  TASK_FAIL = 'task.fail',
  TASK_PAUSE = 'task.pause',
  TASK_RESUME = 'task.resume',
  TASK_CANCEL = 'task.cancel',

  // Plan review states (human-in-the-loop gate before any action runs)
  PLAN_REVIEW = 'plan.review',
  PLAN_APPROVED = 'plan.approved',
  PLAN_REJECTED = 'plan.rejected',

  // Step level states
  STEP_START = 'step.start',
  STEP_OK = 'step.ok',
  STEP_FAIL = 'step.fail',
  STEP_CANCEL = 'step.cancel',

  // Action/Tool level states
  ACT_START = 'act.start',
  ACT_OK = 'act.ok',
  ACT_FAIL = 'act.fail',
  /** The agent is blocked, waiting for the user to allow a sensitive action */
  ACT_CONFIRM = 'act.confirm',
  ACT_DECLINED = 'act.declined',
}

export interface EventData {
  /** Data associated with an event */
  taskId: string;
  /** step is the step number of the task where the event occurred */
  step: number;
  /** max_steps is the maximum number of steps in the task */
  maxSteps: number;
  /** details is the content of the event */
  details: string;
  /**
   * Structured payload for events that carry more than a message. Which shape it holds is
   * determined by `state`: PLAN_REVIEW carries a plan, ACT_CONFIRM carries an action request.
   */
  payload?: EventPayload;
}

export type EventPayload = PlanReviewPayload | ActionConfirmationPayload;

/** A sensitive action the agent wants to run, held for the user to allow or decline. */
export interface ActionConfirmationPayload {
  /** why it was flagged, e.g. `purchase` or `destructive` */
  kind: string;
  /** the agent's own description of what it is about to do */
  description: string;
  /** the element label, URL or field the action targets */
  target: string;
  /** the page the action would run on, so the user can see where this is happening */
  url: string;
}

/** The plan shown to the user for approval before the navigator is allowed to act. */
export interface PlanReviewPayload {
  /** what the planner observed about the current page */
  observation: string;
  /** the steps the agent intends to take */
  nextSteps: string;
  /** risks or blockers the planner flagged */
  challenges: string;
  /** why the planner chose this approach */
  reasoning: string;
}

export class AgentEvent {
  /**
   * Represents a state change event in the task execution system.
   * Each event has a type, a specific state that changed,
   * the actor that triggered the change, and associated data.
   */
  constructor(
    public actor: Actors,
    public state: ExecutionState,
    public data: EventData,
    public timestamp: number = Date.now(),
    public type: EventType = EventType.EXECUTION,
  ) {}
}

// The type of callback for event subscribers
export type EventCallback = (event: AgentEvent) => Promise<void>;
