/**
 * Which model tier should handle the next navigation step.
 *
 * Most steps in a web task are mechanical — click the obvious button, type into the one visible
 * field, scroll — and spending a frontier model on them is pure waste. The hard steps are the ones
 * where something has already gone wrong, where the page is dense enough that picking the right
 * element is a real decision, or where the only description of the page is an image.
 */
export enum ModelTier {
  /** the cheap model configured for the Fast role */
  FAST = 'fast',
  /** the model configured for the Navigator role */
  PRIMARY = 'primary',
}

/** Everything the router looks at. Kept as plain data so the decision is testable in isolation. */
export interface RoutingSignals {
  /** consecutive failures so far in this task */
  consecutiveFailures: number;
  /** whether the previous step's actions reported an error */
  lastStepErrored: boolean;
  /** number of interactive elements on the page the step will act on */
  interactiveElementCount: number;
  /** whether this step will reason over a screenshot rather than a DOM listing */
  usesVision: boolean;
  /** whether a freshly produced plan has not been acted on yet */
  startingNewPlan: boolean;
}

export interface RoutingDecision {
  tier: ModelTier;
  /** why this tier was chosen, for the log and for anyone debugging a surprising choice */
  reason: string;
}

/**
 * Above this many interactive elements, choosing the right one stops being obvious. The figure is a
 * judgement call rather than a measurement: low enough that dense app UIs and search result pages go
 * to the primary model, high enough that ordinary content pages and forms do not.
 */
export const DENSE_PAGE_ELEMENT_COUNT = 60;

/**
 * Pick the model tier for the next navigation step.
 *
 * The bias is toward the primary model: every condition here is a reason to escalate, and FAST is
 * only what is left when none of them hold. A wrong cheap step costs a retry and often a wrong page
 * state on top, which is more expensive than the tokens it saved.
 */
export function routeStep(signals: RoutingSignals): RoutingDecision {
  if (signals.consecutiveFailures > 0) {
    return { tier: ModelTier.PRIMARY, reason: 'recovering from a failure' };
  }
  if (signals.lastStepErrored) {
    return { tier: ModelTier.PRIMARY, reason: 'previous step reported an error' };
  }
  if (signals.usesVision) {
    return { tier: ModelTier.PRIMARY, reason: 'step reasons over a screenshot' };
  }
  if (signals.startingNewPlan) {
    return { tier: ModelTier.PRIMARY, reason: 'first step of a new plan' };
  }
  if (signals.interactiveElementCount > DENSE_PAGE_ELEMENT_COUNT) {
    return { tier: ModelTier.PRIMARY, reason: `dense page (${signals.interactiveElementCount} elements)` };
  }
  return { tier: ModelTier.FAST, reason: 'routine step on a simple page' };
}
