/**
 * The part of an Executor that undoing a step needs. Narrow on purpose: the orchestration below is
 * the whole reason this file exists, and stating it against an interface is what lets it be tested
 * without standing up a model, a browser context and a message manager first.
 */
export interface UndoTarget {
  isPaused(): boolean;
  pause(): Promise<void>;
  resume(): Promise<void>;
  undoLastStep(): Promise<void>;
}

/**
 * Roll the last step back with the agent held still, then hand it back exactly as it was found.
 *
 * The pause is not optional: `undoLastStep` navigates the page and rewrites the agent's memory of
 * what happened, and an agent still stepping through that would act on a page it has the wrong
 * model of.
 *
 * Releasing it again is not optional either, and that is the part this exists to guarantee. The
 * agent loop parks in `shouldStop()` on `while (paused)` with no timeout and nothing else in the
 * product sends a resume, so a pause left standing strands the task for good - input disabled, Stop
 * still showing, no further steps - until the user gives up and starts over. The `finally` is what
 * holds that even when the rollback itself throws, which is exactly when it is easiest to forget.
 *
 * A pause the user set themselves is left alone. They asked for it; finishing an undo is not a
 * reason to override them.
 */
export async function undoLastStepSafely(target: UndoTarget): Promise<void> {
  const wasAlreadyPaused = target.isPaused();
  await target.pause();
  try {
    await target.undoLastStep();
  } finally {
    if (!wasAlreadyPaused) await target.resume();
  }
}
