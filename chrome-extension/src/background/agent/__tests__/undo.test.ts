import { describe, it, expect, vi } from 'vitest';
import { undoLastStepSafely, type UndoTarget } from '../undo';

/**
 * A stand-in Executor that records the order of the calls, because the ordering IS the contract:
 * pausing after the rollback started, or resuming before it finished, both defeat the point.
 */
function target(overrides: { startPaused?: boolean; undo?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  let paused = overrides.startPaused ?? false;

  const fake: UndoTarget = {
    isPaused: () => paused,
    pause: async () => {
      calls.push('pause');
      paused = true;
    },
    resume: async () => {
      calls.push('resume');
      paused = false;
    },
    undoLastStep: async () => {
      calls.push('undo');
      await overrides.undo?.();
    },
  };

  return { fake, calls, isPaused: () => paused };
}

describe('undoLastStepSafely', () => {
  it('pauses, rolls back, and hands the agent back running', async () => {
    const { fake, calls, isPaused } = target();

    await undoLastStepSafely(fake);

    expect(calls).toEqual(['pause', 'undo', 'resume']);
    // The regression this whole module exists for: a task left paused here never runs again.
    expect(isPaused()).toBe(false);
  });

  it('still resumes when the rollback throws', async () => {
    const boom = new Error('goBack failed: no history entry');
    const { fake, calls, isPaused } = target({
      undo: () => Promise.reject(boom),
    });

    await expect(undoLastStepSafely(fake)).rejects.toThrow(boom);

    expect(calls).toEqual(['pause', 'undo', 'resume']);
    expect(isPaused()).toBe(false);
  });

  it('leaves a deliberate pause alone', async () => {
    const { fake, calls, isPaused } = target({ startPaused: true });

    await undoLastStepSafely(fake);

    expect(calls).toEqual(['pause', 'undo']);
    // The user paused; undoing a step is not a reason to start the agent up again behind them.
    expect(isPaused()).toBe(true);
  });

  it('leaves a deliberate pause alone even when the rollback throws', async () => {
    const { fake, isPaused } = target({
      startPaused: true,
      undo: () => Promise.reject(new Error('nope')),
    });

    await expect(undoLastStepSafely(fake)).rejects.toThrow('nope');
    expect(isPaused()).toBe(true);
  });

  it('reads the pause state before pausing, not after', async () => {
    // Guards the ordering bug this is one line away from: sampling isPaused() after pause() would
    // read `true` every time, so the agent would never be resumed and every undo would strand it.
    const isPaused = vi.fn().mockReturnValue(false);
    const pause = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);

    await undoLastStepSafely({ isPaused, pause, resume, undoLastStep: async () => {} });

    expect(isPaused).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(isPaused.mock.invocationCallOrder[0]).toBeLessThan(pause.mock.invocationCallOrder[0]);
  });
});
