import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Actors } from '@extension/storage';
import { AgentEvent, ExecutionState } from '../../types/event';
import { PROGRESS_MESSAGE } from '../../constants';
import { useTaskStateHandler } from '../useTaskStateHandler';
import type * as ReactModule from 'react';
import type { EventPayload } from '../../types/event';

/**
 * `useTaskStateHandler` is a `useCallback` wrapper around a pure event-to-state translation, and
 * everything it needs is passed in as props. Neutering `useCallback` to the identity function lets
 * the translation be driven directly with spies, with no renderer involved — this repo has neither
 * `@testing-library/react` nor a DOM implementation installed, and this needs neither.
 */
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactModule>('react');
  return { ...actual, useCallback: <T>(fn: T) => fn };
});

/* eslint-disable react-hooks/rules-of-hooks --
   With `useCallback` mocked above there is no dispatcher involved: `useTaskStateHandler` is a
   plain function of its props here, so the rule's assumption that this must run inside a render
   does not hold. */

const TIMESTAMP = 1_700_000_000_000;

function setup() {
  const spies = {
    appendMessage: vi.fn(),
    setCanUndo: vi.fn(),
    setTokenUsage: vi.fn(),
    setIsHistoricalSession: vi.fn(),
    setPendingPlan: vi.fn(),
    setPendingAction: vi.fn(),
    setInputEnabled: vi.fn(),
    setShowStopButton: vi.fn(),
    setIsFollowUpMode: vi.fn(),
    setIsReplaying: vi.fn(),
  };
  const isReplayingRef = { current: false };
  const handle = useTaskStateHandler({ ...spies, isReplayingRef });
  return { handle, isReplayingRef, ...spies };
}

function event(actor: Actors, state: ExecutionState, details = 'detail text', payload?: EventPayload) {
  return new AgentEvent(actor, state, { taskId: 'task-1', step: 1, maxSteps: 10, details, payload }, TIMESTAMP);
}

/** The contents of every message the handler appended, in order. */
const appended = (appendMessage: ReturnType<typeof vi.fn>) =>
  appendMessage.mock.calls.map(([message]) => message.content);

/**
 * The actor/state pairs the background can put on the wire, read off its emit sites.
 *
 * SYSTEM's list also covers TASK_RESUME, which the panel accepts although nothing emits it yet,
 * and TASK_USAGE, which every agent reports as SYSTEM (see `recordUsage` in agents/base.ts).
 * STEP_RETRY is emitted as the agent's own actor, so it reaches both the planner and the
 * navigator arm (`eventActor` in agents/base.ts and its two overrides).
 */
const EMITTED: Array<[Actors, ExecutionState]> = [
  [Actors.SYSTEM, ExecutionState.TASK_START],
  [Actors.SYSTEM, ExecutionState.TASK_OK],
  [Actors.SYSTEM, ExecutionState.TASK_FAIL],
  [Actors.SYSTEM, ExecutionState.TASK_CANCEL],
  [Actors.SYSTEM, ExecutionState.TASK_PAUSE],
  [Actors.SYSTEM, ExecutionState.TASK_RESUME],
  [Actors.SYSTEM, ExecutionState.TASK_USAGE],
  [Actors.SYSTEM, ExecutionState.PLAN_REVIEW],
  [Actors.SYSTEM, ExecutionState.PLAN_APPROVED],
  [Actors.SYSTEM, ExecutionState.PLAN_REJECTED],
  [Actors.PLANNER, ExecutionState.STEP_START],
  [Actors.PLANNER, ExecutionState.STEP_OK],
  [Actors.PLANNER, ExecutionState.STEP_FAIL],
  [Actors.PLANNER, ExecutionState.STEP_CANCEL],
  [Actors.PLANNER, ExecutionState.STEP_RETRY],
  [Actors.NAVIGATOR, ExecutionState.STEP_START],
  [Actors.NAVIGATOR, ExecutionState.STEP_OK],
  [Actors.NAVIGATOR, ExecutionState.STEP_FAIL],
  [Actors.NAVIGATOR, ExecutionState.STEP_CANCEL],
  [Actors.NAVIGATOR, ExecutionState.STEP_RETRY],
  [Actors.NAVIGATOR, ExecutionState.ACT_START],
  [Actors.NAVIGATOR, ExecutionState.ACT_OK],
  [Actors.NAVIGATOR, ExecutionState.ACT_FAIL],
  [Actors.NAVIGATOR, ExecutionState.ACT_CONFIRM],
  [Actors.NAVIGATOR, ExecutionState.ACT_DECLINED],
  // Legacy events, still present in stored histories that get replayed into the panel.
  [Actors.VALIDATOR, ExecutionState.STEP_START],
  [Actors.VALIDATOR, ExecutionState.STEP_OK],
  [Actors.VALIDATOR, ExecutionState.STEP_FAIL],
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('coverage of the emitted event surface', () => {
  // Every unhandled pair lands on a `default` arm that logs and returns, so the event is dropped
  // and the panel silently stops updating. Nothing else surfaces that, which is why it is asserted
  // pair by pair rather than left to the behaviour tests below.
  it.each(EMITTED)('handles %s / %s without falling through to a default arm', (actor, state) => {
    const { handle } = setup();
    handle(event(actor, state));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs and drops an actor it does not know', () => {
    const { handle, appendMessage } = setup();
    handle(event('auditor' as Actors, ExecutionState.STEP_OK));
    expect(errorSpy).toHaveBeenCalledWith('Unknown actor', 'auditor');
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('logs and drops a state the actor does not expect', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.PLANNER, ExecutionState.ACT_START));
    expect(errorSpy).toHaveBeenCalledWith('Invalid step state', ExecutionState.ACT_START);
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('ignores user events, which the panel has already rendered locally', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.USER, ExecutionState.STEP_OK));
    expect(appendMessage).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('TASK_USAGE', () => {
  const usage = {
    total: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0,
    },
    byModel: [],
    unreportedCalls: 0,
  };

  it('records the usage snapshot', () => {
    const { handle, setTokenUsage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_USAGE, '15', usage));
    expect(setTokenUsage).toHaveBeenCalledWith(usage);
  });

  /**
   * Usage is per-call telemetry, emitted several times a step. It must stay out of the chat, which
   * is persisted: a message here would write a wall of token counts into the stored history.
   */
  it('appends no message', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_USAGE, '15', usage));
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('returns before the actor switch, so no other state is touched', () => {
    const { handle, setTokenUsage, ...rest } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_USAGE, '15', usage));
    expect(setTokenUsage).toHaveBeenCalledTimes(1);
    for (const [name, spy] of Object.entries(rest)) {
      if (typeof spy === 'function' && 'mock' in spy) {
        expect(`${name}: ${(spy as ReturnType<typeof vi.fn>).mock.calls.length}`).toBe(`${name}: 0`);
      }
    }
  });

  it('stores null when the event carries no payload', () => {
    const { handle, setTokenUsage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_USAGE, '15'));
    expect(setTokenUsage).toHaveBeenCalledWith(null);
  });
});

describe('STEP_RETRY', () => {
  // A retry can take tens of seconds. Without a message the panel just sits on the spinner and
  // reads as hung, which is the whole reason this state exists.
  it('tells the user the planner is retrying', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.PLANNER, ExecutionState.STEP_RETRY, 'attempt 2/3, retrying in 4s'));
    expect(appended(appendMessage)).toEqual(['attempt 2/3, retrying in 4s']);
    expect(appendMessage).toHaveBeenCalledWith({
      actor: Actors.PLANNER,
      content: 'attempt 2/3, retrying in 4s',
      timestamp: TIMESTAMP,
    });
  });

  it('tells the user the navigator is retrying', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_RETRY, 'attempt 2/3, retrying in 4s'));
    expect(appended(appendMessage)).toEqual(['attempt 2/3, retrying in 4s']);
  });

  // The notice replaces the spinner rather than joining it, so the row does not read as both.
  it('does not leave a progress row behind on the navigator', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_RETRY));
    expect(appended(appendMessage)).not.toContain(PROGRESS_MESSAGE);
  });
});

describe('system task lifecycle', () => {
  it('clears the historical flag and the undo offer when a task starts', () => {
    const { handle, setIsHistoricalSession, setCanUndo, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_START));
    expect(setIsHistoricalSession).toHaveBeenCalledWith(false);
    expect(setCanUndo).toHaveBeenCalledWith(false);
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('re-opens the input and leaves follow-up mode on when a task succeeds', () => {
    const { handle, setInputEnabled, setShowStopButton, setIsFollowUpMode, setIsReplaying, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_OK));
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    expect(setShowStopButton).toHaveBeenCalledWith(false);
    expect(setIsFollowUpMode).toHaveBeenCalledWith(true);
    expect(setIsReplaying).toHaveBeenCalledWith(false);
    // The executor already reported the result; a second copy would duplicate it.
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('shows the reason when a task fails', () => {
    const { handle, appendMessage, setInputEnabled, setIsFollowUpMode } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_FAIL, 'rate limited'));
    expect(appended(appendMessage)).toEqual(['rate limited']);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    expect(setIsFollowUpMode).toHaveBeenCalledWith(true);
  });

  // A cancelled task is not something to follow up on, unlike a failed one.
  it('leaves follow-up mode when a task is cancelled', () => {
    const { handle, setIsFollowUpMode, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'stopped'));
    expect(setIsFollowUpMode).toHaveBeenCalledWith(false);
    expect(appended(appendMessage)).toEqual(['stopped']);
  });

  it('clears both gates whenever a task ends', () => {
    for (const state of [ExecutionState.TASK_OK, ExecutionState.TASK_FAIL, ExecutionState.TASK_CANCEL]) {
      const { handle, setPendingPlan, setPendingAction } = setup();
      handle(event(Actors.SYSTEM, state));
      expect(setPendingPlan).toHaveBeenCalledWith(null);
      expect(setPendingAction).toHaveBeenCalledWith(null);
    }
  });

  // A pause carries a reason only sometimes — e.g. the confirmation that a step was undone.
  it('shows a pause only when it carries a reason', () => {
    const withReason = setup();
    withReason.handle(event(Actors.SYSTEM, ExecutionState.TASK_PAUSE, 'undid the last step'));
    expect(appended(withReason.appendMessage)).toEqual(['undid the last step']);

    const silent = setup();
    silent.handle(event(Actors.SYSTEM, ExecutionState.TASK_PAUSE, ''));
    expect(silent.appendMessage).not.toHaveBeenCalled();
  });

  it('says nothing on resume', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.TASK_RESUME));
    expect(appendMessage).not.toHaveBeenCalled();
  });
});

describe('plan review gate', () => {
  const plan = { observation: 'on the search page', nextSteps: 'search', challenges: 'none', reasoning: 'because' };

  // The executor is blocked until the user answers, so the input area is handed to the plan card.
  it('parks the plan and takes over the input', () => {
    const { handle, setPendingPlan, setInputEnabled, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.PLAN_REVIEW, '', plan));
    expect(setPendingPlan).toHaveBeenCalledWith(plan);
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('clears the plan and reports it on approval, without re-enabling the input', () => {
    const { handle, setPendingPlan, setInputEnabled, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.PLAN_APPROVED, 'plan approved'));
    expect(setPendingPlan).toHaveBeenCalledWith(null);
    expect(appended(appendMessage)).toEqual(['plan approved']);
    // Execution continues, so the input stays locked.
    expect(setInputEnabled).not.toHaveBeenCalled();
  });

  it('hands control back to the user on rejection', () => {
    const { handle, setPendingPlan, setPendingAction, setInputEnabled, setShowStopButton, appendMessage } = setup();
    handle(event(Actors.SYSTEM, ExecutionState.PLAN_REJECTED, 'plan rejected'));
    expect(setPendingPlan).toHaveBeenCalledWith(null);
    expect(setPendingAction).toHaveBeenCalledWith(null);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    expect(setShowStopButton).toHaveBeenCalledWith(false);
    expect(appended(appendMessage)).toEqual(['plan rejected']);
  });
});

describe('action confirmation gate', () => {
  const action = { kind: 'purchase', description: 'buy the ticket', target: 'Pay now', url: 'https://shop.test' };

  it('parks the action and takes over the input', () => {
    const { handle, setPendingAction, setInputEnabled, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_CONFIRM, '', action));
    expect(setPendingAction).toHaveBeenCalledWith(action);
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('clears the action and reports it when declined', () => {
    const { handle, setPendingAction, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_DECLINED, 'declined'));
    expect(setPendingAction).toHaveBeenCalledWith(null);
    expect(appended(appendMessage)).toEqual(['declined']);
  });
});

describe('navigator steps and actions', () => {
  it('shows the progress row while a step runs', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_START, 'thinking'));
    // The spinner replaces the detail text rather than following it.
    expect(appended(appendMessage)).toEqual([PROGRESS_MESSAGE]);
  });

  it('says nothing when a step succeeds, since the actions already reported', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_OK, 'done'));
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('reports a failed step and drops the progress row', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_FAIL, 'could not find the button'));
    expect(appended(appendMessage)).toEqual(['could not find the button']);
  });

  it('says nothing when a step is cancelled', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_CANCEL));
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('announces an action as it starts', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_START, 'Clicking Submit'));
    expect(appended(appendMessage)).toEqual(['Clicking Submit']);
  });

  // Cache warm-ups are internal bookkeeping, not something the user asked for.
  it('hides the cache_content action', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_START, 'cache_content'));
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('reports a failed action', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, 'element detached'));
    expect(appended(appendMessage)).toEqual(['element detached']);
  });
});

describe('undo offer', () => {
  // Anything that reached the browser is something the user may want rolled back.
  it('opens on a successful action', () => {
    const { handle, setCanUndo } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'clicked Submit'));
    expect(setCanUndo).toHaveBeenCalledWith(true);
  });

  it('stays closed for a step that never touched the page', () => {
    const { handle, setCanUndo } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.STEP_OK));
    expect(setCanUndo).not.toHaveBeenCalled();
  });
});

describe('replay', () => {
  // During a live run the ACT_START line already said what was about to happen, so echoing the
  // result doubles every action. A replay has no such line, so the result is all there is.
  it('reports successful actions only while replaying', () => {
    const live = setup();
    live.handle(event(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'clicked Submit'));
    expect(live.appendMessage).not.toHaveBeenCalled();

    const replaying = setup();
    replaying.isReplayingRef.current = true;
    replaying.handle(event(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'clicked Submit'));
    expect(appended(replaying.appendMessage)).toEqual(['clicked Submit']);
  });

  // The ref is read at call time, never captured, so the handler can stay referentially stable
  // while replay state changes underneath it.
  it('reads the replay flag at call time rather than at construction', () => {
    const { handle, isReplayingRef, appendMessage } = setup();
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'first'));
    isReplayingRef.current = true;
    handle(event(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'second'));
    expect(appended(appendMessage)).toEqual(['second']);
  });
});

describe('legacy validator events', () => {
  it('still renders validator history', () => {
    const progress = setup();
    progress.handle(event(Actors.VALIDATOR, ExecutionState.STEP_START));
    expect(appended(progress.appendMessage)).toEqual([PROGRESS_MESSAGE]);

    const ok = setup();
    ok.handle(event(Actors.VALIDATOR, ExecutionState.STEP_OK, 'looks right'));
    expect(appended(ok.appendMessage)).toEqual(['looks right']);

    const fail = setup();
    fail.handle(event(Actors.VALIDATOR, ExecutionState.STEP_FAIL, 'wrong page'));
    expect(appended(fail.appendMessage)).toEqual(['wrong page']);
  });
});

describe('message shape', () => {
  it('carries the event actor and timestamp through', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.PLANNER, ExecutionState.STEP_OK, 'planned'));
    expect(appendMessage).toHaveBeenCalledWith({
      actor: Actors.PLANNER,
      content: 'planned',
      timestamp: TIMESTAMP,
    });
  });

  // `content` is a required string on Message; an undefined would break rendering downstream.
  it('substitutes an empty string when the event carries no detail', () => {
    const { handle, appendMessage } = setup();
    handle(new AgentEvent(Actors.PLANNER, ExecutionState.STEP_OK, { taskId: 't', step: 1, maxSteps: 10 } as never));
    expect(appendMessage.mock.calls[0][0].content).toBe('');
  });

  it('appends without a session id, so the message lands in the live session', () => {
    const { handle, appendMessage } = setup();
    handle(event(Actors.PLANNER, ExecutionState.STEP_OK, 'planned'));
    expect(appendMessage.mock.calls[0]).toHaveLength(1);
  });
});
