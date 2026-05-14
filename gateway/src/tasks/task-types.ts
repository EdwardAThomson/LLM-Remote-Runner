import { AnyBackend } from '../adapters';

export type TaskState = 'queued' | 'running' | 'completed' | 'error' | 'canceled';

export interface TaskLogEvent {
  line: string;
  stream: 'stdout' | 'stderr';
  ts: string;
}

export interface TaskSummary {
  id: string;
  prompt: string;
  cwd?: string | null;
  backend: AnyBackend;
  model?: string | null;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  exitCode: number | null;
  errorMessage: string | null;
}

export interface TaskDetail extends TaskSummary {
  logs: TaskLogEvent[];
}
