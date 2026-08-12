export enum Actors {
  SYSTEM = 'system',
  USER = 'user',
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  VALIDATOR = 'validator',
}

export interface Message {
  actor: Actors;
  content: string;
  timestamp: number; // Unix timestamp in milliseconds
}

export interface ChatMessage extends Message {
  id: string; // Unique ID for each message
}

export interface ChatSessionMetadata {
  id: string;
  title: string;
  createdAt: number; // Unix timestamp in milliseconds
  updatedAt: number; // Unix timestamp in milliseconds
  messageCount: number;
}

// ChatSession is the full conversation history displayed in the Sidepanel
export interface ChatSession extends ChatSessionMetadata {
  messages: ChatMessage[];
}

// ChatAgentStepHistory is the history of the every step of the agent
export interface ChatAgentStepHistory {
  task: string;
  history: string;
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Token spend for one session, as reported by the providers themselves.
 *
 * Structurally mirrors the side panel's TokenUsagePayload so a snapshot can be stored and read back
 * without a conversion; storage deliberately does not import from the extension workspace.
 */
export interface ChatTokenUsage {
  total: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningOutputTokens: number;
  };
  byModel: Array<{
    agent: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningOutputTokens: number;
  }>;
  /** calls whose provider reported nothing, which makes `total` a floor rather than the truth */
  unreportedCalls: number;
}

export interface ChatHistoryStorage {
  // Get all chat sessions (with empty message arrays for listing)
  getAllSessions: () => Promise<ChatSession[]>;

  // Clear all chat sessions and messages
  clearAllSessions: () => Promise<void>;

  // Get only session metadata (for efficient listing)
  getSessionsMetadata: () => Promise<ChatSessionMetadata[]>;

  // Get a specific chat session with its messages
  getSession: (sessionId: string) => Promise<ChatSession | null>;

  // Create a new chat session
  createSession: (title: string) => Promise<ChatSession>;

  // Update an existing chat session
  updateTitle: (sessionId: string, title: string) => Promise<ChatSessionMetadata>;

  // Delete a chat session
  deleteSession: (sessionId: string) => Promise<void>;

  // Add a message to a chat session
  addMessage: (sessionId: string, message: Message) => Promise<ChatMessage>;

  // Delete a message from a chat session
  deleteMessage: (sessionId: string, messageId: string) => Promise<void>;

  // Store what a session spent, so reopening it can still show the number
  storeTokenUsage: (sessionId: string, usage: ChatTokenUsage) => Promise<void>;

  // Read back a session's spend, or null when it was never recorded
  loadTokenUsage: (sessionId: string) => Promise<ChatTokenUsage | null>;

  // Store the history of the agent's state
  storeAgentStepHistory: (sessionId: string, task: string, history: string) => Promise<void>;

  // Load the history of the agent's state
  loadAgentStepHistory: (sessionId: string) => Promise<ChatAgentStepHistory | null>;
}
