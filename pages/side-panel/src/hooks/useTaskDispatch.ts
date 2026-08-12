import { Actors, chatHistoryStore } from '@extension/storage';
import { t } from '@extension/i18n';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Message } from '@extension/storage';
import type { ActionConfirmationPayload, PlanReviewPayload } from '../types/event';

interface TaskDispatchProps {
  /** posted to directly, so a re-render can never swap the port out from under a handler */
  portRef: MutableRefObject<chrome.runtime.Port | null>;
  setupConnection: () => void;
  sendMessage: (message: unknown) => void;
  stopConnection: () => void;
  appendMessage: (newMessage: Message, sessionId?: string | null) => void;
  replayEnabled: boolean;
  isHistoricalSession: boolean;
  isFollowUpMode: boolean;
  /** mirrors currentSessionId, so a session created mid-handler is visible before re-render */
  sessionIdRef: MutableRefObject<string | null>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  setInputEnabled: Dispatch<SetStateAction<boolean>>;
  setShowStopButton: Dispatch<SetStateAction<boolean>>;
  setIsFollowUpMode: Dispatch<SetStateAction<boolean>>;
  setIsHistoricalSession: Dispatch<SetStateAction<boolean>>;
  setIsReplaying: Dispatch<SetStateAction<boolean>>;
  setPendingPlan: Dispatch<SetStateAction<PlanReviewPayload | null>>;
  setPendingAction: Dispatch<SetStateAction<ActionConfirmationPayload | null>>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
}

/**
 * Everything the user can ask of a task: start one, replay one, stop one, and answer the two
 * gates the agent can park on (a plan awaiting approval, an action awaiting confirmation).
 *
 * These are deliberately plain functions rather than memoised callbacks. Each one reads state
 * straight out of the current render, which is what keeps decisions like "is this a follow-up?"
 * honest; memoising them would freeze that state at the wrong moment.
 */
export const useTaskDispatch = ({
  portRef,
  setupConnection,
  sendMessage,
  stopConnection,
  appendMessage,
  replayEnabled,
  isHistoricalSession,
  isFollowUpMode,
  sessionIdRef,
  setMessages,
  setCurrentSessionId,
  setInputEnabled,
  setShowStopButton,
  setIsFollowUpMode,
  setIsHistoricalSession,
  setIsReplaying,
  setPendingPlan,
  setPendingAction,
  setCanUndo,
}: TaskDispatchProps) => {
  // Handle replay command
  const handleReplay = async (historySessionId: string): Promise<void> => {
    try {
      // Check if replay is enabled in settings
      if (!replayEnabled) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_replay_disabled'),
          timestamp: Date.now(),
        });
        return;
      }

      // Check if history exists using loadAgentStepHistory
      const historyData = await chatHistoryStore.loadAgentStepHistory(historySessionId);
      if (!historyData) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_replay_noHistory', historySessionId.substring(0, 20)),
          timestamp: Date.now(),
        });
        return;
      }

      // Get current tab ID
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      // Clear messages if we're in a historical session
      if (isHistoricalSession) {
        setMessages([]);
      }

      // Create a new chat session for this replay task
      const newSession = await chatHistoryStore.createSession(`Replay of ${historySessionId.substring(0, 20)}...`);

      // Store the new session ID in both state and ref
      const newTaskId = newSession.id;
      setCurrentSessionId(newTaskId);
      sessionIdRef.current = newTaskId;

      // Send replay command to background
      setInputEnabled(false);
      setShowStopButton(true);

      // Reset follow-up mode and historical session flags
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);

      const userMessage = {
        actor: Actors.USER,
        content: `/replay ${historySessionId}`,
        timestamp: Date.now(),
      };

      // Add the user message to the new session
      appendMessage(userMessage, sessionIdRef.current);

      // Setup connection if not exists
      if (!portRef.current) {
        setupConnection();
      }

      // Send replay command to background with the task from history
      portRef.current?.postMessage({
        type: 'replay',
        taskId: newTaskId,
        tabId: tabId,
        historySessionId: historySessionId,
        task: historyData.task, // Add the task from history
      });

      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_replay_starting', historyData.task),
        timestamp: Date.now(),
      });
      setIsReplaying(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_replay_failed', errorMessage),
        timestamp: Date.now(),
      });
    }
  };

  // Handle chat commands that start with /
  const handleCommand = async (command: string): Promise<boolean> => {
    try {
      // Setup connection if not exists
      if (!portRef.current) {
        setupConnection();
      }

      // Handle different commands
      if (command === '/state') {
        portRef.current?.postMessage({
          type: 'state',
        });
        return true;
      }

      if (command === '/nohighlight') {
        portRef.current?.postMessage({
          type: 'nohighlight',
        });
        return true;
      }

      if (command.startsWith('/replay ')) {
        // Parse replay command: /replay <historySessionId>
        // Handle multiple spaces by filtering out empty strings
        const parts = command.split(' ').filter(part => part.trim() !== '');
        if (parts.length !== 2) {
          appendMessage({
            actor: Actors.SYSTEM,
            content: t('chat_replay_invalidArgs'),
            timestamp: Date.now(),
          });
          return true;
        }

        const historySessionId = parts[1];
        await handleReplay(historySessionId);
        return true;
      }

      // Unsupported command
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('errors_cmd_unknown', command),
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Command error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      return true;
    }
  };

  const handleSendMessage = async (text: string, displayText?: string) => {
    // Trim the input text first
    const trimmedText = text.trim();

    if (!trimmedText) return;

    // Check if the input is a command (starts with /)
    if (trimmedText.startsWith('/')) {
      // Process command and return if it was handled
      const wasHandled = await handleCommand(trimmedText);
      if (wasHandled) return;
    }

    // Block sending messages in historical sessions
    if (isHistoricalSession) {
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      setInputEnabled(false);
      setShowStopButton(true);

      // Create a new chat session for this task if not in follow-up mode
      if (!isFollowUpMode) {
        // Use display text for session title if available, otherwise use full text
        const titleText = displayText || text;
        const newSession = await chatHistoryStore.createSession(
          titleText.substring(0, 50) + (titleText.length > 50 ? '...' : ''),
        );

        // Store the session ID in both state and ref
        const sessionId = newSession.id;
        setCurrentSessionId(sessionId);
        sessionIdRef.current = sessionId;
      }

      const userMessage = {
        actor: Actors.USER,
        content: displayText || text, // Use display text for chat UI, full text for background service
        timestamp: Date.now(),
      };

      // Pass the sessionId directly to appendMessage
      appendMessage(userMessage, sessionIdRef.current);

      // Setup connection if not exists
      if (!portRef.current) {
        setupConnection();
      }

      // Send message using the utility function
      if (isFollowUpMode) {
        // Send as follow-up task
        await sendMessage({
          type: 'follow_up_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
      } else {
        // Send as new task
        await sendMessage({
          type: 'new_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setInputEnabled(true);
      setShowStopButton(false);
      stopConnection();
    }
  };

  const handleStopTask = async () => {
    try {
      portRef.current?.postMessage({
        type: 'cancel_task',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('cancel_task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
    }
    setInputEnabled(true);
    setShowStopButton(false);
  };

  const handlePlanDecision = (approved: boolean) => {
    setPendingPlan(null);
    try {
      portRef.current?.postMessage({
        type: approved ? 'approve_plan' : 'reject_plan',
      });
      if (approved) {
        setInputEnabled(false);
        setShowStopButton(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('plan review error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setInputEnabled(true);
    }
  };

  const handleUndo = () => {
    setCanUndo(false);
    try {
      portRef.current?.postMessage({ type: 'undo_last_step' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('undo_last_step error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
    }
  };

  const handleActionDecision = (approved: boolean) => {
    setPendingAction(null);
    try {
      portRef.current?.postMessage({ type: approved ? 'confirm_action' : 'decline_action' });
      setInputEnabled(false);
      setShowStopButton(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('action confirmation error', errorMessage);
      appendMessage({ actor: Actors.SYSTEM, content: errorMessage, timestamp: Date.now() });
      setInputEnabled(true);
    }
  };

  return { handleReplay, handleSendMessage, handleStopTask, handlePlanDecision, handleUndo, handleActionDecision };
};
