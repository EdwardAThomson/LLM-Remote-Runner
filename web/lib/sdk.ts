import {
  AnyBackend,
  cancelTask as sdkCancelTask,
  createTask as sdkCreateTask,
  CreateTaskOptions,
  CreateTaskPayload,
  CreateTaskResponse,
  streamTask as sdkStreamTask,
  StreamTaskHandlers,
  StreamTaskOptions,
  TaskDetail,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
} from '@codex/sdk';
import { getToken } from './auth';

// Re-export types for convenience
export type { AnyBackend, TaskState, TaskStatusEvent, TaskStreamEvent, CreateTaskResponse };

function getGatewayBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
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
