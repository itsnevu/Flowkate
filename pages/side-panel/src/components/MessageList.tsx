import { memo, useMemo, useState } from 'react';
import { t } from '@extension/i18n';
import { ACTOR_PROFILES } from '../types/message';
import { splitMarkdownTables, tableToCsv } from '../markdownTable';
import StepTrail from './StepTrail';
import type { Message } from '@extension/storage';
import type { TableBlock } from '../markdownTable';

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
  const isUser = message.actor === 'user';
  const steps = message.steps ?? [];
  // A task that hit trouble opens its own trail: that is what the reader came for.
  const hasIssue = steps.some(step => step.kind === 'error');
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
        <MessageContent content={message.content} />
      </div>

      {steps.length > 0 && (
        <div className="mt-1.5 w-full max-w-[85%]">
          <StepTrail steps={steps} defaultExpanded={hasIssue} />
        </div>
      )}

      <div className="mt-1 px-1 text-[11px] uppercase tracking-wide text-ink-faint">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  );
}

/**
 * Message text, with any pipe tables rendered as real tables.
 *
 * Every other message renders exactly as before (one pre-wrap div); only a strict
 * header/separator/rows sequence is promoted, so prose with a stray pipe stays prose.
 */
function MessageContent({ content }: { content: string }) {
  const blocks = useMemo(() => splitMarkdownTables(content), [content]);

  if (blocks.length === 1 && blocks[0].type === 'text') {
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {blocks.map((block, index) =>
        block.type === 'text' ? (
          <div key={index} className="whitespace-pre-wrap break-words">
            {block.text}
          </div>
        ) : (
          <ResultTable key={index} table={block} />
        ),
      )}
    </div>
  );
}

/** One extracted table: scrolls inside its own well, with a copy-as-CSV key underneath. */
function ResultTable({ table }: { table: TableBlock }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCsv = () => {
    navigator.clipboard
      ?.writeText(tableToCsv(table))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto rounded-soft bg-canvas-sunk p-2 shadow-neu-inset-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {table.header.map((cell, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-1.5 font-semibold text-ink">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-t border-black/5">
                {row.map((cell, c) => (
                  <td key={c} className="px-2 py-1.5 align-top text-ink-soft">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={handleCopyCsv}
        className="mt-1.5 rounded-pill bg-canvas-raised px-2.5 py-1 text-[11px] font-medium text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm">
        {copied ? t('chat_table_copied') : t('chat_table_copyCsv')}
      </button>
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
