import {
  AnyBackend,
  cancelTask as sdkCancelTask,
  createTask as sdkCreateTask,
  CreateTaskOptions,
  CreateTaskPayload,
  CreateTaskResponse,
  deleteTask as sdkDeleteTask,
  getTask as sdkGetTask,
  listTasks as sdkListTasks,
  ListTasksQuery,
  ListTasksResponse,
  streamTask as sdkStreamTask,
  StreamTaskHandlers,
  StreamTaskOptions,
  TaskDetail,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
  TaskSummary,
} from '@codex/sdk';
import { getToken } from './auth';

// Re-export types for convenience
export type {
  AnyBackend,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
  CreateTaskResponse,
  TaskDetail,
  TaskSummary,
  ListTasksQuery,
  ListTasksResponse,
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
