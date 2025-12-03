import {
  CreateTaskOptions,
  CreateTaskPayload,
  CreateTaskResponse,
  cancelTask as sdkCancelTask,
  streamTask as sdkStreamTask,
  StreamTaskHandlers,
  StreamTaskOptions,
  TaskDetail,
} from '@codex/sdk';
import { createTask as sdkCreateTask } from '@codex/sdk';

function getGatewayBaseUrl(): string {
  return process.env.EXPO_PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';
}

export async function createTask(
  payload: CreateTaskPayload,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<CreateTaskResponse> {
  return sdkCreateTask(getGatewayBaseUrl(), payload, options);
}

export function streamTask(
  taskId: string,
  handlers: StreamTaskHandlers,
  options?: Omit<StreamTaskOptions, 'token'>,
): () => void {
  // React Native does not ship with EventSource support out of the box.
  // Consumers should provide a polyfill via `eventSourceFactory` once available.
  return sdkStreamTask(getGatewayBaseUrl(), taskId, handlers, options);
}

export async function cancelTask(
  taskId: string,
  reason?: string,
  options?: Omit<CreateTaskOptions, 'token'>,
): Promise<TaskDetail> {
  return sdkCancelTask(getGatewayBaseUrl(), taskId, reason, options);
}
