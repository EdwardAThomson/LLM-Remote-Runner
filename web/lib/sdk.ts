import {
  AnyBackend,
  cancelTask as sdkCancelTask,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  ConversationViewMode,
  createConversation as sdkCreateConversation,
  CreateConversationPayload,
  createTask as sdkCreateTask,
  CreateTaskOptions,
  CreateTaskPayload,
  CreateTaskResponse,
  deleteConversation as sdkDeleteConversation,
  deleteTask as sdkDeleteTask,
  getConversation as sdkGetConversation,
  getTask as sdkGetTask,
  listConversations as sdkListConversations,
  ListConversationsQuery,
  ListConversationsResponse,
  listTasks as sdkListTasks,
  ListTasksQuery,
  ListTasksResponse,
  MessageRecord,
  MessageRole,
  renameConversation as sdkRenameConversation,
  sendMessage as sdkSendMessage,
  SendMessagePayload,
  SendMessageResponse,
  streamTask as sdkStreamTask,
  StreamTaskHandlers,
  StreamTaskOptions,
  TaskDetail,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
  TaskSummary,
  updateConversation as sdkUpdateConversation,
  UpdateConversationPayload,
} from '@codex/sdk';
import { getToken } from './auth';

// Re-export types for convenience
export type {
  AnyBackend,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  ConversationViewMode,
  CreateConversationPayload,
  CreateTaskResponse,
  ListConversationsQuery,
  ListConversationsResponse,
  ListTasksQuery,
  ListTasksResponse,
  MessageRecord,
  MessageRole,
  SendMessagePayload,
  SendMessageResponse,
  TaskDetail,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
  TaskSummary,
  UpdateConversationPayload,
};

function getGatewayBaseUrl(): string {
  return import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3000';
}

function getAuthToken(): string | undefined {
  // Use session token from cookies instead of env variable
  return getToken();
}

export async function createTask(
  payload: CreateTaskPayload,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<CreateTaskResponse> {
  return sdkCreateTask(getGatewayBaseUrl(), payload, {
    ...options,
    token: getAuthToken(),
  });
}

export function streamTask(
  taskId: string,
  handlers: StreamTaskHandlers,
  options?: Omit<StreamTaskOptions, 'token'>,
): () => void {
  return sdkStreamTask(getGatewayBaseUrl(), taskId, handlers, {
    ...options,
    token: getAuthToken(),
  });
}

export async function cancelTask(
  taskId: string,
  reason?: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<TaskDetail> {
  return sdkCancelTask(getGatewayBaseUrl(), taskId, reason, {
    ...options,
    token: getAuthToken(),
  });
}

export async function listTasks(
  query: ListTasksQuery = {},
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ListTasksResponse> {
  return sdkListTasks(getGatewayBaseUrl(), query, {
    ...options,
    token: getAuthToken(),
  });
}

export async function getTask(
  taskId: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<TaskDetail> {
  return sdkGetTask(getGatewayBaseUrl(), taskId, {
    ...options,
    token: getAuthToken(),
  });
}

export async function deleteTask(
  taskId: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<void> {
  return sdkDeleteTask(getGatewayBaseUrl(), taskId, {
    ...options,
    token: getAuthToken(),
  });
}

// -- Conversations (Phase B) -------------------------------------------------

export async function listConversations(
  query: ListConversationsQuery = {},
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ListConversationsResponse> {
  return sdkListConversations(getGatewayBaseUrl(), query, {
    ...options,
    token: getAuthToken(),
  });
}

export async function getConversation(
  id: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ConversationDetail> {
  return sdkGetConversation(getGatewayBaseUrl(), id, {
    ...options,
    token: getAuthToken(),
  });
}

export async function createConversation(
  payload: CreateConversationPayload = {},
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ConversationSummary> {
  return sdkCreateConversation(getGatewayBaseUrl(), payload, {
    ...options,
    token: getAuthToken(),
  });
}

export async function updateConversation(
  id: string,
  patch: UpdateConversationPayload,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ConversationSummary> {
  return sdkUpdateConversation(getGatewayBaseUrl(), id, patch, {
    ...options,
    token: getAuthToken(),
  });
}

export async function renameConversation(
  id: string,
  title: string | null,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<ConversationSummary> {
  return sdkRenameConversation(getGatewayBaseUrl(), id, title, {
    ...options,
    token: getAuthToken(),
  });
}

export async function deleteConversation(
  id: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<void> {
  return sdkDeleteConversation(getGatewayBaseUrl(), id, {
    ...options,
    token: getAuthToken(),
  });
}

export async function sendMessage(
  conversationId: string,
  payload: SendMessagePayload,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<SendMessageResponse> {
  return sdkSendMessage(getGatewayBaseUrl(), conversationId, payload, {
    ...options,
    token: getAuthToken(),
  });
}
