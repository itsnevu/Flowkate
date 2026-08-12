import { t } from '@extension/i18n';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import BookmarkList from './BookmarkList';
import PlanReviewCard from './PlanReviewCard';
import ActionConfirmCard from './ActionConfirmCard';
import AutoModeNotice from './AutoModeNotice';
import TokenUsageBar from './TokenUsageBar';
import LiveStatusStrip from './LiveStatusStrip';
import type { RefObject } from 'react';
import type { ApprovalMode, Message, TrailStep } from '@extension/storage';
import type { FavoritePrompt } from '@extension/storage/lib/prompt/favorites';
import type { ActionConfirmationPayload, PlanReviewPayload, TokenUsagePayload } from '../types/event';
import type { LiveStatus } from '../types/status';

interface ChatViewProps {
  messages: Message[];
  favoritePrompts: FavoritePrompt[];
  inputEnabled: boolean;
  showStopButton: boolean;
  isRecording: boolean;
  isProcessingSpeech: boolean;
  isHistoricalSession: boolean;
  replayEnabled: boolean;
  currentSessionId: string | null;
  pendingPlan: PlanReviewPayload | null;
  pendingAction: ActionConfirmationPayload | null;
  canUndo: boolean;
  /** what the running task is doing right now, or null when nothing is running */
  liveStatus: LiveStatus | null;
  /** the steps the running task has taken so far, shown collapsed under the status line */
  trail: TrailStep[];
  tokenUsage: TokenUsagePayload | null;
  messagesEndRef: RefObject<HTMLDivElement>;
  onSetInputText: (setter: (text: string) => void) => void;
  onSendMessage: (text: string, displayText?: string) => void;
  onStopTask: () => void;
  onMicClick: () => void;
  onReplay: (sessionId: string) => void;
  onBookmarkSelect: (content: string) => void;
  onBookmarkUpdateTitle: (id: number, title: string) => void;
  onBookmarkDelete: (id: number) => void;
  onBookmarkReorder: (draggedId: number, targetId: number) => void;
  onPlanDecision: (approved: boolean) => void;
  onActionDecision: (approved: boolean) => void;
  onUndo: () => void;
  /** how much the user signs off on before the agent acts */
  approvalMode: ApprovalMode;
  onApprovalModeSelect: (mode: ApprovalMode) => void;
  /** true while the user is being shown, once, what Auto gives up */
  pendingAutoNotice: boolean;
  onAcknowledgeAuto: () => void;
  onDismissAutoNotice: () => void;
}

/**
 * The chat surface itself, shown once at least one model is configured. An empty transcript
 * leads with the composer and the pinned prompts; once the conversation starts, the transcript
 * takes the space and the composer drops to the bottom.
 */
const ChatView = ({
  messages,
  favoritePrompts,
  inputEnabled,
  showStopButton,
  isRecording,
  isProcessingSpeech,
  isHistoricalSession,
  replayEnabled,
  currentSessionId,
  pendingPlan,
  pendingAction,
  canUndo,
  liveStatus,
  trail,
  tokenUsage,
  messagesEndRef,
  onSetInputText,
  onSendMessage,
  onStopTask,
  onMicClick,
  onReplay,
  onBookmarkSelect,
  onBookmarkUpdateTitle,
  onBookmarkDelete,
  onBookmarkReorder,
  onPlanDecision,
  onActionDecision,
  onUndo,
  approvalMode,
  onApprovalModeSelect,
  pendingAutoNotice,
  onAcknowledgeAuto,
  onDismissAutoNotice,
}: ChatViewProps) => (
  <>
    {messages.length === 0 && (
      <>
        <div className="shrink-0 px-3 pb-2">
          <ChatInput
            onSendMessage={onSendMessage}
            onStopTask={onStopTask}
            onMicClick={onMicClick}
            isRecording={isRecording}
            isProcessingSpeech={isProcessingSpeech}
            disabled={!inputEnabled || isHistoricalSession}
            showStopButton={showStopButton}
            setContent={onSetInputText}
            historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
            onReplay={onReplay}
            approvalMode={approvalMode}
            onApprovalModeSelect={onApprovalModeSelect}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          <BookmarkList
            bookmarks={favoritePrompts}
            onBookmarkSelect={onBookmarkSelect}
            onBookmarkUpdateTitle={onBookmarkUpdateTitle}
            onBookmarkDelete={onBookmarkDelete}
            onBookmarkReorder={onBookmarkReorder}
          />
        </div>
      </>
    )}
    {messages.length > 0 && (
      <div className="scrollbar-gutter-stable flex-1 overflow-x-hidden overflow-y-scroll scroll-smooth px-3 py-1">
        <MessageList messages={messages} />
        <div ref={messagesEndRef} />
      </div>
    )}
    {pendingAutoNotice && <AutoModeNotice onConfirm={onAcknowledgeAuto} onDismiss={onDismissAutoNotice} />}
    {pendingPlan && (
      <PlanReviewCard
        plan={pendingPlan}
        onApprove={() => onPlanDecision(true)}
        onReject={() => onPlanDecision(false)}
      />
    )}
    {pendingAction && (
      <ActionConfirmCard
        request={pendingAction}
        onConfirm={() => onActionDecision(true)}
        onDecline={() => onActionDecision(false)}
      />
    )}
    {canUndo && !pendingPlan && !pendingAction && !isHistoricalSession && (
      <div className="shrink-0 px-3 pb-1 pt-2">
        <button
          type="button"
          onClick={onUndo}
          className="w-full rounded-soft bg-canvas-raised px-3 py-2 text-xs font-medium text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-ink hover:shadow-neu active:shadow-neu-inset-sm">
          ↩ {t('chat_undo')}
        </button>
      </div>
    )}
    {liveStatus && !pendingPlan && !pendingAction && <LiveStatusStrip status={liveStatus} trail={trail} />}
    {tokenUsage && messages.length > 0 && !pendingPlan && !pendingAction && <TokenUsageBar usage={tokenUsage} />}
    {messages.length > 0 && (
      <div className="shrink-0 px-3 pb-3 pt-2">
        <ChatInput
          onSendMessage={onSendMessage}
          onStopTask={onStopTask}
          onMicClick={onMicClick}
          isRecording={isRecording}
          isProcessingSpeech={isProcessingSpeech}
          disabled={!inputEnabled || isHistoricalSession}
          showStopButton={showStopButton}
          setContent={onSetInputText}
          historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
          onReplay={onReplay}
          approvalMode={approvalMode}
          onApprovalModeSelect={onApprovalModeSelect}
        />
      </div>
    )}
  </>
);

export default ChatView;
