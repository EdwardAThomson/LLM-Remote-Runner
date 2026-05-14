'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnyBackend,
  cancelTask,
  getTask,
  streamTask,
  TaskDetail as TaskDetailType,
  TaskState,
  TaskStatusEvent,
} from '../lib/sdk';
import Header from './Header';

const BACKEND_LABELS: Record<AnyBackend, string> = {
  codex: 'Codex CLI',
  'claude-cli': 'Claude CLI',
  'gemini-cli': 'Gemini CLI',
  'openai-api': 'OpenAI API',
  'anthropic-api': 'Anthropic API',
  'gemini-api': 'Gemini API',
};

interface TaskDetailProps {
  taskId: string;
}

interface LogEntry {
  line: string;
  stream: 'stdout' | 'stderr';
  ts?: string;
}

export default function TaskDetailView({ taskId }: TaskDetailProps) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentState, setCurrentState] = useState<TaskState | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const streamCleanup = useRef<(() => void) | undefined>();
  const logsPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const isLive = currentState === 'queued' || currentState === 'running';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await getTask(taskId);
      setTask(detail);
      setLogs(
        detail.logs.map((log) => ({
          line: log.line,
          stream: (log.stream ?? 'stdout') as 'stdout' | 'stderr',
          ts: log.ts,
        })),
      );
      setCurrentState(detail.state);
      setCurrentError(detail.errorMessage);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!task) return;
    if (!isLive) {
      streamCleanup.current?.();
      streamCleanup.current = undefined;
      return;
    }

    streamCleanup.current?.();
    streamCleanup.current = streamTask(
      taskId,
      {
        onStatus: (event: TaskStatusEvent) => {
          setCurrentState(event.state);
          setCurrentError(event.error ?? null);
        },
        onLog: (event) => {
          setLogs((prev) => [
            ...prev,
            {
              line: event.line,
              stream: (event.stream ?? 'stdout') as 'stdout' | 'stderr',
              ts: event.ts,
            },
          ]);
        },
        onDone: (event) => {
          if (event.state) setCurrentState(event.state as TaskState);
          streamCleanup.current?.();
          streamCleanup.current = undefined;
        },
        onError: () => {
          // EventSource auto-retries; surface nothing
        },
      },
      {},
    );

    return () => {
      streamCleanup.current?.();
      streamCleanup.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, isLive]);

  useEffect(() => {
    if (autoScrollRef.current && logsPanelRef.current) {
      logsPanelRef.current.scrollTo({
        top: logsPanelRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [logs.length]);

  const handleCancel = async () => {
    if (!task) return;
    setIsCancelling(true);
    try {
      await cancelTask(task.id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to cancel task');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRunAgain = () => {
    if (!task) return;
    const params = new URLSearchParams();
    params.set('prompt', task.prompt);
    if (task.backend) params.set('backend', task.backend);
    if (task.model) params.set('model', task.model);
    if (task.cwd) params.set('cwd', task.cwd);
    router.push(`/tasks/new?${params.toString()}`);
  };

  return (
    <>
      <Header />
      <div className="task-detail">
        <div className="task-detail-back">
          <Link href="/" className="link-button">← Dashboard</Link>
        </div>

        {loading && !task ? <p>Loading…</p> : null}
        {loadError ? <p className="error-banner">{loadError}</p> : null}

        {task ? (
          <>
            <div className="task-detail-meta">
              <div className="task-detail-row">
                <span className={`state-badge state-${currentState ?? task.state}`}>
                  {currentState ?? task.state}
                </span>
                <span className="task-detail-backend">
                  {BACKEND_LABELS[task.backend] ?? task.backend}
                </span>
                {task.model ? <span className="task-detail-model">{task.model}</span> : null}
                {task.cwd ? <span className="task-detail-cwd">cwd: {task.cwd}</span> : null}
              </div>
              <div className="task-detail-times">
                <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
                {task.exitCode !== null ? <span>Exit: {task.exitCode}</span> : null}
              </div>
              {currentError ? (
                <p className="task-detail-error">{currentError}</p>
              ) : null}
            </div>

            <div className="task-detail-section">
              <h2 className="section-title">Prompt</h2>
              <pre className="task-detail-prompt">{task.prompt}</pre>
            </div>

            <div className="task-detail-actions">
              {isLive ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel Task'}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRunAgain}
                >
                  Run Again
                </button>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={load}
                disabled={loading}
              >
                Refresh
              </button>
            </div>

            <div className="task-detail-section">
              <h2 className="section-title">Output</h2>
              <div
                className="stream-panel"
                ref={logsPanelRef}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  autoScrollRef.current =
                    target.scrollHeight - target.scrollTop <=
                    target.clientHeight + 50;
                }}
              >
                {logs.length === 0 ? (
                  <p className="stream-empty">No output yet.</p>
                ) : (
                  <ul className="stream-list">
                    {logs.map((log, index) => (
                      <li key={index}>
                        <span
                          className={
                            log.stream === 'stderr'
                              ? 'stream-log-error'
                              : 'stream-log'
                          }
                        >
                          {log.line}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
