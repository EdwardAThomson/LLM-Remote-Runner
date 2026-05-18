export type TaskState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'error'
  | 'canceled';

/**
 * Supported CLI backends
 */
export type CliBackend = 'codex' | 'claude-cli' | 'gemini-cli';

/**
 * Supported API backends
 */
export type ApiBackend = 'openai-api' | 'anthropic-api' | 'gemini-api';

/**
 * All supported backends (CLI + API)
 */
export type AnyBackend = CliBackend | ApiBackend;

export interface CreateTaskPayload {
  prompt: string;
  cwd?: string;
  /** Backend to use (defaults to server config) */
  backend?: AnyBackend;
  /** Model override (for backends that support it) */
  model?: string;
  /** System prompt (for API backends) */
  systemPrompt?: string;
  /**
   * If set, the gateway POSTs `{ task_id, state, exit_code, error_message }`
   * to this URL when the task finalizes. Body is signed with HMAC-SHA256 via
   * `webhookSecret` in the `X-Runner-Signature: sha256=<hex>` header.
   */
  webhookUrl?: string;
  /** Shared secret used to HMAC-sign the webhook body. */
  webhookSecret?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskOptions {
  token?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface TaskSummary {
  id: string;
  prompt: string;
  cwd?: string;
  /** Backend used for this task */
  backend: AnyBackend;
  /** Model used (if applicable) */
  model?: string | null;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  exitCode: number | null;
  errorMessage: string | null;
  /** Set when this task is part of a conversation turn. */
  conversationId?: string | null;
}

export interface CreateTaskResponse {
  task_id: string;
  task?: TaskSummary;
}

export interface ListTasksQuery {
  limit?: number;
  cursor?: string;
  backend?: AnyBackend;
  state?: TaskState;
}

export interface ListTasksResponse {
  items: TaskSummary[];
  next_cursor: string | null;
}

export type TaskStreamEvent =
  | { type: 'status'; data: TaskStatusEvent }
  | { type: 'log'; data: TaskLogEvent }
  | { type: 'heartbeat'; data: TaskHeartbeatEvent }
  | { type: 'done'; data: TaskDoneEvent };

export interface TaskStatusEvent {
  state: TaskState;
  ts?: string;
  error?: string;
}

export interface TaskLogEvent {
  line: string;
  ts?: string;
  stream?: 'stdout' | 'stderr';
}

export interface TaskDoneEvent {
  exit_code: number;
  state?: TaskState;
}

export interface TaskHeartbeatEvent {
  ts: string;
}

export type TaskDetail = TaskSummary & {
  logs: TaskLogEvent[];
};

export interface StreamTaskHandlers {
  onEvent?: (event: TaskStreamEvent) => void;
  onStatus?: (event: TaskStatusEvent) => void;
  onLog?: (event: TaskLogEvent) => void;
  onDone?: (event: TaskDoneEvent) => void;
  onHeartbeat?: (event: TaskHeartbeatEvent) => void;
  onError?: (error: Event | Error) => void;
}

export interface StreamTaskOptions {
  token?: string;
  eventSourceInit?: EventSourceInit;
  eventSourceFactory?: (url: string, eventSourceInitDict?: EventSourceInit) => EventSource;
}

export async function createTask(
  baseUrl: string,
  payload: CreateTaskPayload,
  options: CreateTaskOptions = {},
): Promise<CreateTaskResponse> {
  const url = new URL('/api/tasks', baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create task (${response.status}): ${text}`);
  }

  return (await response.json()) as CreateTaskResponse;
}

export function streamTask(
  baseUrl: string,
  taskId: string,
  handlers: StreamTaskHandlers,
  options: StreamTaskOptions = {},
): () => void {
  const factory = options.eventSourceFactory ?? defaultEventSourceFactory;
  const url = new URL(`/api/tasks/${taskId}/stream`, baseUrl);
  if (options.token) {
    url.searchParams.set('token', options.token);
  }

  const eventSource = factory(url.toString(), options.eventSourceInit);

  const forward = <T>(type: TaskStreamEvent['type'], data: T) => {
    handlers.onEvent?.({ type, data } as TaskStreamEvent);
    switch (type) {
      case 'status':
        handlers.onStatus?.(data as TaskStatusEvent);
        break;
      case 'log':
        handlers.onLog?.(data as TaskLogEvent);
        break;
      case 'heartbeat':
        handlers.onHeartbeat?.(data as TaskHeartbeatEvent);
        break;
      case 'done':
        handlers.onDone?.(data as TaskDoneEvent);
        break;
      default:
        break;
    }
  };

  eventSource.addEventListener('status', (event) => {
    const parsed = parseEvent<TaskStatusEvent>(event);
    forward('status', parsed);
  });

  eventSource.addEventListener('log', (event) => {
    const parsed = parseEvent<TaskLogEvent>(event);
    forward('log', parsed);
  });

  eventSource.addEventListener('heartbeat', (event) => {
    const parsed = parseEvent<TaskHeartbeatEvent>(event);
    forward('heartbeat', parsed);
  });

  eventSource.addEventListener('done', (event) => {
    const parsed = parseEvent<TaskDoneEvent>(event);
    forward('done', parsed);
  });

  eventSource.onerror = (error) => {
    handlers.onError?.(error);
  };

  return () => {
    eventSource.close();
  };
}

export async function listTasks(
  baseUrl: string,
  query: ListTasksQuery = {},
  options: CreateTaskOptions = {},
): Promise<ListTasksResponse> {
  const url = new URL('/api/tasks', baseUrl);
  if (query.limit !== undefined) url.searchParams.set('limit', String(query.limit));
  if (query.cursor) url.searchParams.set('cursor', query.cursor);
  if (query.backend) url.searchParams.set('backend', query.backend);
  if (query.state) url.searchParams.set('state', query.state);

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    signal: options.signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list tasks (${response.status}): ${text}`);
  }
  return (await response.json()) as ListTasksResponse;
}

export async function getTask(
  baseUrl: string,
  taskId: string,
  options: CreateTaskOptions = {},
): Promise<TaskDetail> {
  const url = new URL(`/api/tasks/${taskId}`, baseUrl);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    signal: options.signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get task (${response.status}): ${text}`);
  }
  return (await response.json()) as TaskDetail;
}

export async function deleteTask(
  baseUrl: string,
  taskId: string,
  options: CreateTaskOptions = {},
): Promise<void> {
  const url = new URL(`/api/tasks/${taskId}`, baseUrl);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers,
    signal: options.signal,
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Failed to delete task (${response.status}): ${text}`);
  }
}

export async function cancelTask(
  baseUrl: string,
  taskId: string,
  reason?: string,
  options: CreateTaskOptions = {},
): Promise<TaskDetail> {
  const url = new URL(`/api/tasks/${taskId}/cancel`, baseUrl);
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  let body: string | undefined;
  if (reason && reason.trim().length > 0) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ reason: reason.trim() });
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body,
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to cancel task (${response.status}): ${text}`);
  }

  return (await response.json()) as TaskDetail;
}

function parseEvent<T>(event: Event): T {
  const message = event as MessageEvent<string>;
  try {
    return JSON.parse(message.data) as T;
  } catch (error) {
    throw new Error(`Unable to parse event payload: ${(error as Error).message}`);
  }
}

function defaultEventSourceFactory(
  url: string,
  init?: EventSourceInit,
): EventSource {
  if (typeof EventSource === 'undefined') {
    throw new Error(
      'EventSource is not available in this environment. Provide a custom eventSourceFactory.',
    );
  }
  return new EventSource(url, init);
}

// ============================================
// Conversations (Phase B)
// ============================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export type ConversationViewMode = 'chat' | 'console';

export interface ConversationSummary {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  /** Preferred render mode for this conversation. Persisted on the row. */
  viewMode: ConversationViewMode;
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

export interface CreateConversationPayload {
  title?: string;
  systemPrompt?: string;
  /**
   * If set, seed the conversation from this task — its prompt + captured
   * stdout become the first user/assistant turn. The original task must not
   * already belong to a conversation.
   */
  fromTaskId?: string;
  /** Default render mode. Server defaults to `console` if `fromTaskId` is set, else `chat`. */
  viewMode?: ConversationViewMode;
}

export interface UpdateConversationPayload {
  /** Use null to clear. */
  title?: string | null;
  /** Use null to clear. */
  systemPrompt?: string | null;
  viewMode?: ConversationViewMode;
}

export interface SendMessagePayload {
  content: string;
  backend?: AnyBackend;
  model?: string;
  /** CLI backends only; must be inside the configured workspace allowlist. */
  cwd?: string;
}

export interface SendMessageResponse {
  message_id: string;
  task_id: string;
}

export interface ListConversationsQuery {
  limit?: number;
  cursor?: string;
}

export interface ListConversationsResponse {
  items: ConversationSummary[];
  next_cursor: string | null;
}

export async function listConversations(
  baseUrl: string,
  query: ListConversationsQuery = {},
  options: CreateTaskOptions = {},
): Promise<ListConversationsResponse> {
  const url = new URL('/api/conversations', baseUrl);
  if (query.limit !== undefined) url.searchParams.set('limit', String(query.limit));
  if (query.cursor) url.searchParams.set('cursor', query.cursor);
  return fetchJson<ListConversationsResponse>(url, 'GET', undefined, options, 'list conversations');
}

export async function getConversation(
  baseUrl: string,
  id: string,
  options: CreateTaskOptions = {},
): Promise<ConversationDetail> {
  const url = new URL(`/api/conversations/${id}`, baseUrl);
  return fetchJson<ConversationDetail>(url, 'GET', undefined, options, 'get conversation');
}

export async function createConversation(
  baseUrl: string,
  payload: CreateConversationPayload = {},
  options: CreateTaskOptions = {},
): Promise<ConversationSummary> {
  const url = new URL('/api/conversations', baseUrl);
  return fetchJson<ConversationSummary>(url, 'POST', payload, options, 'create conversation');
}

export async function updateConversation(
  baseUrl: string,
  id: string,
  patch: UpdateConversationPayload,
  options: CreateTaskOptions = {},
): Promise<ConversationSummary> {
  const url = new URL(`/api/conversations/${id}`, baseUrl);
  return fetchJson<ConversationSummary>(url, 'PATCH', patch, options, 'update conversation');
}

/** Convenience wrapper around `updateConversation` for the common rename case. */
export async function renameConversation(
  baseUrl: string,
  id: string,
  title: string | null,
  options: CreateTaskOptions = {},
): Promise<ConversationSummary> {
  return updateConversation(baseUrl, id, { title }, options);
}

export async function deleteConversation(
  baseUrl: string,
  id: string,
  options: CreateTaskOptions = {},
): Promise<void> {
  const url = new URL(`/api/conversations/${id}`, baseUrl);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers,
    signal: options.signal,
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Failed to delete conversation (${response.status}): ${text}`);
  }
}

export async function sendMessage(
  baseUrl: string,
  conversationId: string,
  payload: SendMessagePayload,
  options: CreateTaskOptions = {},
): Promise<SendMessageResponse> {
  const url = new URL(`/api/conversations/${conversationId}/messages`, baseUrl);
  return fetchJson<SendMessageResponse>(url, 'POST', payload, options, 'send message');
}

async function fetchJson<T>(
  url: URL,
  method: 'GET' | 'POST' | 'PATCH',
  body: unknown,
  options: CreateTaskOptions,
  errorLabel: string,
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to ${errorLabel} (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}
