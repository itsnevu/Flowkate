import { memo } from 'react';
import { ACTOR_PROFILES } from '../types/message';
import type { Message } from '@extension/storage';

interface MessageListProps {
  messages: Message[];
}

export default memo(function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex max-w-full flex-col">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${message.timestamp}-${index}`}
          message={message}
          isSameActor={index > 0 ? messages[index - 1].actor === message.actor : false}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
}

function MessageBlock({ message, isSameActor }: MessageBlockProps) {
  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  const isProgress = message.content === 'Showing progress...';
  const isUser = message.actor === 'user';
  // The user speaks in graphite keys; every agent answers on a raised pale card.
  const bubble = isUser
    ? 'rounded-slab bg-graphite text-graphite-50 shadow-key'
    : 'rounded-slab bg-canvas-raised text-ink shadow-neu';

  return (
    <div
      className={`flex max-w-full animate-rise flex-col ${isUser ? 'items-end' : 'items-start'} ${
        isSameActor ? 'mt-1.5' : 'mt-5 first:mt-0'
      }`}>
      {!isSameActor && (
        <div className={`mb-1.5 flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          {/* The actor glyphs are white-on-transparent, so they sit on a graphite puck rather than the pale canvas. */}
          <div className="grid size-7 shrink-0 place-items-center rounded-pill bg-graphite shadow-key-sm">
            <img src={actor.icon} alt={actor.name} className="size-4" />
          </div>
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">{actor.name}</span>
        </div>
      )}

      <div className={`min-w-0 max-w-[85%] px-3.5 py-2.5 text-sm ${bubble}`}>
        <div className="whitespace-pre-wrap break-words">
          {isProgress ? (
            <div className="h-1.5 w-32 animate-pulse-soft overflow-hidden rounded-pill bg-canvas-sunk shadow-neu-inset-sm">
              <div className="h-full w-1/2 animate-progress rounded-pill bg-graphite" />
            </div>
          ) : (
            message.content
          )}
        </div>
      </div>

      {!isProgress && (
        <div className="mt-1 px-1 text-[11px] uppercase tracking-wide text-ink-faint">
          {formatTimestamp(message.timestamp)}
        </div>
      )}
    </div>
  );
}

/**
 * Formats a timestamp (in milliseconds) to a readable time string
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted time string
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Check if the message is from today
  const isToday = date.toDateString() === now.toDateString();

  // Check if the message is from yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  // Check if the message is from this year
  const isThisYear = date.getFullYear() === now.getFullYear();

  // Format the time (HH:MM)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return timeStr; // Just show the time for today's messages
  }

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  if (isThisYear) {
    // Show month and day for this year
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  }

  // Show full date for older messages
  return `${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}, ${timeStr}`;
}
