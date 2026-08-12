import { useCallback } from 'react';
import { Actors } from '@extension/storage';
import { ExecutionState } from '../types/event';
import { PROGRESS_MESSAGE } from '../constants';
import { playTaskChime } from '../chime';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Message } from '@extension/storage';
import type { ActionConfirmationPayload, AgentEvent, PlanReviewPayload, TokenUsagePayload } from '../types/event';

interface TaskStateHandlerProps {
  appendMessage: (newMessage: Message, sessionId?: string | null) => void;
  /** read, never written, so the handler can stay stable while replay state changes */
  isReplayingRef: MutableRefObject<boolean>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
  setTokenUsage: Dispatch<SetStateAction<TokenUsagePayload | null>>;
  setIsHistoricalSession: Dispatch<SetStateAction<boolean>>;
  setPendingPlan: Dispatch<SetStateAction<PlanReviewPayload | null>>;
  setPendingAction: Dispatch<SetStateAction<ActionConfirmationPayload | null>>;
  setInputEnabled: Dispatch<SetStateAction<boolean>>;
  setShowStopButton: Dispatch<SetStateAction<boolean>>;
  setIsFollowUpMode: Dispatch<SetStateAction<boolean>>;
  setIsReplaying: Dispatch<SetStateAction<boolean>>;
}

/**
 * Translates one execution event from the background worker into panel state.
 *
 * The returned callback must stay referentially stable: it is captured once by the port's
 * message listener when the connection is opened, so a new identity per render would leave
 * that listener calling a stale copy. Every input above is stable (state setters, refs and a
 * memoised appender), which is what keeps it that way.
 */
export const useTaskStateHandler = ({
  appendMessage,
  isReplayingRef,
  setCanUndo,
  setTokenUsage,
  setIsHistoricalSession,
  setPendingPlan,
  setPendingAction,
  setInputEnabled,
  setShowStopButton,
  setIsFollowUpMode,
  setIsReplaying,
}: TaskStateHandlerProps) =>
  useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;
      // any step that reached the browser is a step the user may want to roll back
      if (state === ExecutionState.ACT_OK) {
        setCanUndo(true);
      }
      // Handled before the actor switch, whose default arm would log it as an invalid state. The
      // early return also keeps this per-call telemetry out of the persisted chat history.
      if (state === ExecutionState.TASK_USAGE) {
        setTokenUsage((data?.payload as TokenUsagePayload) ?? null);
        return;
      }
      let skip = true;
      let displayProgress = false;

      switch (actor) {
        case Actors.SYSTEM:
          switch (state) {
            case ExecutionState.TASK_START:
              // Reset historical session flag when a new task starts
              setIsHistoricalSession(false);
              setCanUndo(false);
              break;
            case ExecutionState.PLAN_REVIEW:
              // the executor is blocked until the user answers, so take over the input area
              setPendingPlan((data?.payload as PlanReviewPayload) ?? null);
              setInputEnabled(false);
              return;
            case ExecutionState.PLAN_APPROVED:
              setPendingPlan(null);
              skip = false;
              break;
            case ExecutionState.PLAN_REJECTED:
              setPendingPlan(null);
              setPendingAction(null);
              setInputEnabled(true);
              setShowStopButton(false);
              skip = false;
              break;
            case ExecutionState.TASK_OK:
              setPendingPlan(null);
              setPendingAction(null);
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              // Not awaited: the chime is an ornament and must not delay rendering the result.
              // Replays are silent - they are the user re-reading a task, not one finishing.
              if (!isReplayingRef.current) {
                void playTaskChime('ok');
              }
              break;
            case ExecutionState.TASK_FAIL:
              setPendingPlan(null);
              setPendingAction(null);
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              if (!isReplayingRef.current) {
                void playTaskChime('fail');
              }
              skip = false;
              break;
            case ExecutionState.TASK_CANCEL:
              setPendingPlan(null);
              setPendingAction(null);
              setIsFollowUpMode(false);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              skip = false;
              break;
            case ExecutionState.TASK_PAUSE:
              // carries the pause reason, e.g. the confirmation that a step was undone
              skip = !content;
              break;
            case ExecutionState.TASK_RESUME:
              break;
            default:
              console.error('Invalid task state', state);
              return;
          }
          break;
        case Actors.USER:
          break;
        case Actors.PLANNER:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              break;
            case ExecutionState.STEP_RETRY:
              skip = false;
              break;
            default:
              console.error('Invalid step state', state);
              return;
          }
          break;
        case Actors.NAVIGATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              displayProgress = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              displayProgress = false;
              break;
            case ExecutionState.STEP_CANCEL:
              displayProgress = false;
              break;
            case ExecutionState.STEP_RETRY:
              // replace the spinner with the notice, so a stalled step reads as "retrying", not "hung"
              skip = false;
              displayProgress = false;
              break;
            case ExecutionState.ACT_START:
              if (content !== 'cache_content') {
                // skip to display caching content
                skip = false;
              }
              break;
            case ExecutionState.ACT_OK:
              skip = !isReplayingRef.current;
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            case ExecutionState.ACT_CONFIRM:
              // the navigator is blocked until the user answers, so take over the input area
              setPendingAction((data?.payload as ActionConfirmationPayload) ?? null);
              setInputEnabled(false);
              return;
            case ExecutionState.ACT_DECLINED:
              setPendingAction(null);
              skip = false;
              break;
            default:
              console.error('Invalid action', state);
              return;
          }
          break;
        case Actors.VALIDATOR:
          // Handle legacy validator events from historical messages
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid validation', state);
              return;
          }
          break;
        default:
          console.error('Unknown actor', actor);
          return;
      }

      if (!skip) {
        appendMessage({
          actor,
          content: content || '',
          timestamp: timestamp,
        });
      }

      if (displayProgress) {
        appendMessage({
          actor,
          content: PROGRESS_MESSAGE,
          timestamp: timestamp,
        });
      }
    },
    [
      appendMessage,
      isReplayingRef,
      setCanUndo,
      setTokenUsage,
      setIsHistoricalSession,
      setPendingPlan,
      setPendingAction,
      setInputEnabled,
      setShowStopButton,
      setIsFollowUpMode,
      setIsReplaying,
    ],
  );
