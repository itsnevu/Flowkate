import { describe, it, expect } from 'vitest';
import { routeStep, ModelTier, DENSE_PAGE_ELEMENT_COUNT, type RoutingSignals } from '../routing';

/** A step with nothing unusual about it — the only case that should reach the cheap model. */
const routine: RoutingSignals = {
  consecutiveFailures: 0,
  lastStepErrored: false,
  interactiveElementCount: 12,
  usesVision: false,
  startingNewPlan: false,
};

describe('routeStep', () => {
  it('sends a routine step on a simple page to the cheap model', () => {
    expect(routeStep(routine).tier).toBe(ModelTier.FAST);
  });

  describe('escalates to the primary model', () => {
    it('while recovering from a failure', () => {
      expect(routeStep({ ...routine, consecutiveFailures: 1 }).tier).toBe(ModelTier.PRIMARY);
    });

    it('when the previous step errored', () => {
      expect(routeStep({ ...routine, lastStepErrored: true }).tier).toBe(ModelTier.PRIMARY);
    });

    it('when the step reasons over a screenshot', () => {
      expect(routeStep({ ...routine, usesVision: true }).tier).toBe(ModelTier.PRIMARY);
    });

    it('on the first step of a new plan', () => {
      expect(routeStep({ ...routine, startingNewPlan: true }).tier).toBe(ModelTier.PRIMARY);
    });

    it('on a page dense enough that element choice is a real decision', () => {
      expect(routeStep({ ...routine, interactiveElementCount: DENSE_PAGE_ELEMENT_COUNT + 1 }).tier).toBe(
        ModelTier.PRIMARY,
      );
    });
  });

  it('stays on the cheap model right up to the density threshold', () => {
    expect(routeStep({ ...routine, interactiveElementCount: DENSE_PAGE_ELEMENT_COUNT }).tier).toBe(ModelTier.FAST);
  });

  it('explains every decision, so a surprising route can be traced', () => {
    expect(routeStep(routine).reason).toBeTruthy();
    expect(routeStep({ ...routine, consecutiveFailures: 2 }).reason).toContain('failure');
  });
});
