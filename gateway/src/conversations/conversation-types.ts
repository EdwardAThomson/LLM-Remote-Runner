import { AnyBackend, ChatMessage, MessageRole } from '../adapters';

export type { ChatMessage, MessageRole };

/**
 * How the UI should render this conversation. `chat` shows speech bubbles;
 * `console` shows a monospace transcript suitable for watching agentic CLI
 * output. Stored on the conversation row so the choice syncs across browsers.
 */
export type ConversationViewMode = 'chat' | 'console';

export interface ConversationSummary {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  viewMode: ConversationViewMode;
  createdAt: string;
  updatedAt: string;
  /**
   * Backend / model used on the most recent assistant turn — populated by the
   * list query so the dashboard can show a "Gemini CLI · gemini-3-flash-preview"
   * label without N+1 fetching. Null for empty conversations.
   */
  lastBackend?: AnyBackend | null;
  lastModel?: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  taskId: string | null;
  backend: AnyBackend | null;
  model: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageRecord[];
}
