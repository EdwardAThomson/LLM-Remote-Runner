import { AnyBackend, ChatMessage, MessageRole } from '../adapters';

export type { ChatMessage, MessageRole };

export interface ConversationSummary {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
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
