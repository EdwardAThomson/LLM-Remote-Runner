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
}

export interface CreateTaskResponse {
  task_id: string;
  task?: TaskSummary;
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
