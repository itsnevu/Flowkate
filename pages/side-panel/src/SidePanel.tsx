import { useState, useEffect, useCallback, useRef } from 'react';
import { type Message, chatHistoryStore } from '@extension/storage';
import { t } from '@extension/i18n';
import ChatHistoryList from './components/ChatHistoryList';
import ChatView from './components/ChatView';
import SetupGuide from './components/SetupGuide';
import SidePanelHeader from './components/SidePanelHeader';
import { useBackgroundConnection } from './hooks/useBackgroundConnection';
import { useFavoritePrompts } from './hooks/useFavoritePrompts';
import { useModelConfigGate } from './hooks/useModelConfigGate';
import { useSpeechInput } from './hooks/useSpeechInput';
import { useTaskDispatch } from './hooks/useTaskDispatch';
import { useTaskStateHandler } from './hooks/useTaskStateHandler';
import { PROGRESS_MESSAGE } from './constants';
import type { ActionConfirmationPayload, PlanReviewPayload, TokenUsagePayload } from './types/event';
import './SidePanel.css';

// Declare chrome API types
declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

const SidePanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; createdAt: number }>>([]);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isHistoricalSession, setIsHistoricalSession] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanReviewPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionConfirmationPayload | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsagePayload | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isReplayingRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);

  const { hasConfiguredModels, replayEnabled } = useModelConfigGate();
  const { favoritePrompts, addPrompt, updatePromptTitle, removePrompt, reorderPrompts } = useFavoritePrompts();

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    isReplayingRef.current = isReplaying;
  }, [isReplaying]);

  const appendMessage = useCallback((newMessage: Message, sessionId?: string | null) => {
    // Don't save progress messages
    const isProgressMessage = newMessage.content === PROGRESS_MESSAGE;

    setMessages(prev => {
      const filteredMessages = prev.filter(
        (msg, idx) => !(msg.content === PROGRESS_MESSAGE && idx === prev.length - 1),
      );
      return [...filteredMessages, newMessage];
    });

    // Use provided sessionId if available, otherwise fall back to sessionIdRef.current
    const effectiveSessionId = sessionId !== undefined ? sessionId : sessionIdRef.current;

    // Save message to storage if we have a session and it's not a progress message
    if (effectiveSessionId && !isProgressMessage) {
      chatHistoryStore
        .addMessage(effectiveSessionId, newMessage)
        .catch(err => console.error('Failed to save message to history:', err));
    }
  }, []);

  const handleTaskState = useTaskStateHandler({
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
  });

  const { portRef, setupConnection, stopConnection, sendMessage } = useBackgroundConnection({
    onExecutionEvent: handleTaskState,
    appendMessage,
    setInputEnabled,
    setShowStopButton,
    setIsProcessingSpeech,
    setInputTextRef,
  });

  const { isRecording, handleMicClick } = useSpeechInput({
    portRef,
    setupConnection,
    appendMessage,
    setIsProcessingSpeech,
  });

  const { handleReplay, handleSendMessage, handleStopTask, handlePlanDecision, handleUndo, handleActionDecision } =
    useTaskDispatch({
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
    });

  const handleNewChat = () => {
    // Clear messages and start a new chat
    setMessages([]);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setInputEnabled(true);
    setShowStopButton(false);
    setIsFollowUpMode(false);
    setIsHistoricalSession(false);
    setPendingPlan(null);
    setPendingAction(null);
    setCanUndo(false);
    // the background tracker's lifetime is the Executor's, which stopConnection ends
    setTokenUsage(null);

    // Disconnect any existing connection
    stopConnection();
  };

  // Persist the running total so reopening this session later still shows what it cost. Kept here
  // rather than in the event handler: the snapshot is cumulative and idempotent, so writing the
  // latest value is always correct and a dropped event costs freshness, never accuracy.
  useEffect(() => {
    if (!tokenUsage || !currentSessionId) return;
    chatHistoryStore
      .storeTokenUsage(currentSessionId, tokenUsage)
      .catch(err => console.error('Failed to save token usage:', err));
  }, [tokenUsage, currentSessionId]);

  const loadChatSessions = useCallback(async () => {
    try {
      const sessions = await chatHistoryStore.getSessionsMetadata();
      setChatSessions(sessions.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  }, []);

  const handleLoadHistory = async () => {
    await loadChatSessions();
    setShowHistory(true);
  };

  const handleBackToChat = (reset = false) => {
    setShowHistory(false);
    if (reset) {
      setCurrentSessionId(null);
      setMessages([]);
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);
      if (fullSession && fullSession.messages.length > 0) {
        setCurrentSessionId(fullSession.id);
        setMessages(fullSession.messages);
        setIsFollowUpMode(false);
        setIsHistoricalSession(true); // Mark this as a historical session
        // show what THIS session spent, not whatever the last live task happened to leave on screen
        setTokenUsage(await chatHistoryStore.loadTokenUsage(sessionId));
      }
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleSessionDelete = async (sessionId: string) => {
    try {
      await chatHistoryStore.deleteSession(sessionId);
      await loadChatSessions();
      if (sessionId === currentSessionId) {
        setMessages([]);
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleSessionBookmark = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);

      if (fullSession && fullSession.messages.length > 0) {
        // Get the session title
        const sessionTitle = fullSession.title;
        // Get the first 8 words of the title
        const title = sessionTitle.split(' ').slice(0, 8).join(' ');

        // Get the first message content (the task)
        const taskContent = fullSession.messages[0]?.content || '';

        // Add to favorites storage and update the UI
        await addPrompt(title, taskContent);

        // Return to chat view after pinning
        handleBackToChat(true);
      }
    } catch (error) {
      console.error('Failed to pin session to favorites:', error);
    }
  };

  const handleBookmarkSelect = (content: string) => {
    if (setInputTextRef.current) {
      setInputTextRef.current(content);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConnection();
    };
  }, [stopConnection]);

  // Scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <SidePanelHeader
        showHistory={showHistory}
        onBack={() => handleBackToChat(false)}
        onNewChat={handleNewChat}
        onLoadHistory={handleLoadHistory}
      />
      {showHistory ? (
        <div className="flex-1 overflow-hidden">
          <ChatHistoryList
            sessions={chatSessions}
            onSessionSelect={handleSessionSelect}
            onSessionDelete={handleSessionDelete}
            onSessionBookmark={handleSessionBookmark}
            visible={true}
          />
        </div>
      ) : (
        <>
          {/* Show loading state while checking model configuration */}
          {hasConfiguredModels === null && (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="flex flex-col items-center rounded-slab bg-canvas-raised px-8 py-7 text-center shadow-neu">
                <div className="mb-4 size-8 animate-spin rounded-pill border-2 border-graphite-200 border-t-graphite-800" />
                <p className="text-sm text-ink-soft">{t('status_checkingConfig')}</p>
              </div>
            </div>
          )}

          {/* Show setup message when no models are configured */}
          {hasConfiguredModels === false && <SetupGuide />}

          {/* Show normal chat interface when models are configured */}
          {hasConfiguredModels === true && (
            <ChatView
              messages={messages}
              favoritePrompts={favoritePrompts}
              inputEnabled={inputEnabled}
              showStopButton={showStopButton}
              isRecording={isRecording}
              isProcessingSpeech={isProcessingSpeech}
              isHistoricalSession={isHistoricalSession}
              replayEnabled={replayEnabled}
              currentSessionId={currentSessionId}
              pendingPlan={pendingPlan}
              pendingAction={pendingAction}
              canUndo={canUndo}
              tokenUsage={tokenUsage}
              messagesEndRef={messagesEndRef}
              onSetInputText={setter => {
                setInputTextRef.current = setter;
              }}
              onSendMessage={handleSendMessage}
              onStopTask={handleStopTask}
              onMicClick={handleMicClick}
              onReplay={handleReplay}
              onBookmarkSelect={handleBookmarkSelect}
              onBookmarkUpdateTitle={updatePromptTitle}
              onBookmarkDelete={removePrompt}
              onBookmarkReorder={reorderPrompts}
              onPlanDecision={handlePlanDecision}
              onActionDecision={handleActionDecision}
              onUndo={handleUndo}
            />
          )}
        </>
      )}
    </div>
  );
};

export default SidePanel;
