import { type BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

export class MessageMetadata {
  tokens: number;
  message_type: string | null = null;

  constructor(tokens: number, message_type?: string | null) {
    this.tokens = tokens;
    this.message_type = message_type ?? null;
  }
}

export class ManagedMessage {
  message: BaseMessage;
  metadata: MessageMetadata;

  constructor(message: BaseMessage, metadata: MessageMetadata) {
    this.message = message;
    this.metadata = metadata;
  }
}

export class MessageHistory {
  messages: ManagedMessage[] = [];
  totalTokens = 0;

  addMessage(message: BaseMessage, metadata: MessageMetadata, position?: number): void {
    const managedMessage: ManagedMessage = {
      message,
      metadata,
    };

    if (position === undefined) {
      this.messages.push(managedMessage);
    } else {
      this.messages.splice(position, 0, managedMessage);
    }
    this.totalTokens += metadata.tokens;
  }

  removeMessage(index = -1): void {
    if (this.messages.length > 0) {
      const msg = this.messages.splice(index, 1)[0];
      this.totalTokens -= msg.metadata.tokens;
    }
  }

  /**
   * Removes the last message from the history if it is a human message.
   * This is used to remove the state message from the history.
   */
  removeLastStateMessage(): void {
    if (this.messages.length > 2 && this.messages[this.messages.length - 1].message instanceof HumanMessage) {
      const msg = this.messages.pop();
      if (msg) {
        this.totalTokens -= msg.metadata.tokens;
      }
    }
  }

  /**
   * Get all messages
   */
  getMessages(): BaseMessage[] {
    return this.messages.map(m => m.message);
  }

  /**
   * Get total tokens in history
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Drop the oldest exchange that is safe to forget, and report how many tokens that reclaimed.
   *
   * Messages tagged 'init' (system prompt, the task itself, the worked example) are the agent's
   * identity, so they are never evicted. A tool response only makes sense next to the call it
   * answers, so the ToolMessages following an AIMessage go with it. The newest message is never
   * touched here - it is the one the next decision is made from.
   *
   * @returns the number of tokens reclaimed, or 0 when nothing was safe to evict
   */
  /**
   * Drop the oldest evictable exchange, and report how many messages went.
   *
   * The count, not the tokens reclaimed: zero tokens is ambiguous in a way that stopped the trimmer
   * early. A message shorter than the estimator's characters-per-token is counted at 0, so evicting
   * one looked identical to "there is nothing left to evict" - and `cutMessages` broke out of its
   * loop with thousands of evictable tokens still in the history, then threw "context too large" on
   * a history it could have trimmed.
   */
  removeOldestExchange(): number {
    const start = this.messages.findIndex(m => m.metadata.message_type !== 'init');
    if (start < 0) return 0;
    let end = start + 1;
    while (end < this.messages.length && this.messages[end].message instanceof ToolMessage) {
      end++;
    }
    if (end >= this.messages.length) return 0;
    const removed = this.messages.splice(start, end - start);
    this.totalTokens -= removed.reduce((sum, m) => sum + m.metadata.tokens, 0);
    return removed.length;
  }
}
