'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AnyBackend,
  cancelTask,
  createTask,
  streamTask,
  TaskState,
  TaskStatusEvent,
  TaskStreamEvent,
} from '../lib/sdk';
import Header from './Header';

type DisplayableTaskEvent = Extract<
  TaskStreamEvent,
  { type: 'status' | 'log' | 'done' }
>;
type ConsoleEntry = DisplayableTaskEvent | { type: 'info'; message: string };

/**
 * Available backends with display info
 */
const BACKENDS: { value: AnyBackend; label: string; icon: string; isApi?: boolean }[] = [
  // CLI backends
  { value: 'codex', label: 'Codex CLI', icon: '🤖' },
  { value: 'claude-cli', label: 'Claude CLI', icon: '🧠' },
  { value: 'gemini-cli', label: 'Gemini CLI', icon: '✨' },
  // API backends
  { value: 'openai-api', label: 'OpenAI API', icon: '🟢', isApi: true },
  { value: 'anthropic-api', label: 'Anthropic API', icon: '🟣', isApi: true },
  { value: 'gemini-api', label: 'Gemini API', icon: '🔵', isApi: true },
];

const STORAGE_KEY_BACKEND = 'llm-runner-backend';

function getStoredBackend(): AnyBackend {
  if (typeof window === 'undefined') return 'codex';
  const stored = localStorage.getItem(STORAGE_KEY_BACKEND);
  if (stored && BACKENDS.some((b) => b.value === stored)) {
    return stored as AnyBackend;
  }
  return 'codex';
}

export default function TaskConsole() {
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState('');
  const [backend, setBackend] = useState<AnyBackend>('codex');
  const [model, setModel] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [currentTaskBackend, setCurrentTaskBackend] = useState<AnyBackend | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [latestStatus, setLatestStatus] = useState<TaskStatusEvent | null>(null);
  const [heartbeatTs, setHeartbeatTs] = useState<string | null>(null);
  const streamCleanup = useRef<() => void>();
  const streamPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Load stored backend preference on mount
  useEffect(() => {
    setBackend(getStoredBackend());
  }, []);

  // Save backend preference when changed
  const handleBackendChange = (newBackend: AnyBackend) => {
    setBackend(newBackend);
    setModel('');
    localStorage.setItem(STORAGE_KEY_BACKEND, newBackend);
  };

  const appendEntry = useCallback((entry: ConsoleEntry) => {
    setEntries((prev) => [...prev, entry]);
    // Auto-scroll to bottom if user hasn't scrolled up
    if (autoScrollRef.current && streamPanelRef.current) {
      setTimeout(() => {
        streamPanelRef.current?.scrollTo({
          top: streamPanelRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 10);
    }
  }, []);

  const startNewTask = () => {
    // Add separator if there are existing entries
    if (entries.length > 0) {
      setEntries((prev) => [
        ...prev,
        { type: 'info', message: '\n--- New Task ---\n' },
      ]);
    }
    setLatestStatus(null);
    setHeartbeatTs(null);
    setIsCancelling(false);
  };

  useEffect(() => {
    return () => {
      streamCleanup.current?.();
    };
  }, []);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    streamCleanup.current?.();

    streamCleanup.current = streamTask(
      taskId,
      {
        onStatus: (event) => {
          appendEntry({ type: 'status', data: event });
          setLatestStatus(event);
        },
        onLog: (event) => {
          appendEntry({ type: 'log', data: event });
        },
        onDone: (event) => {
          appendEntry({ type: 'done', data: event });
          if (event.state) {
            setLatestStatus((prev) => ({
              state: event.state as TaskState,
              ts: prev?.ts,
              error: undefined,
            }));
          }
          setIsCancelling(false);
          // Close the stream when task is done
          streamCleanup.current?.();
          streamCleanup.current = undefined;
        },
        onHeartbeat: (event) => {
          setHeartbeatTs(event.ts);
        },
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : 'Unknown streaming error';
          setEntries((prev) => [
            ...prev,
            { type: 'info', message: `Stream error: ${message}` },
          ]);
        },
      },
      {},
    );

    return () => {
      streamCleanup.current?.();
    };
  }, [appendEntry, taskId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    startNewTask();

    const currentPrompt = prompt.trim();
    const currentCwd = cwd.trim();
    const currentModel = model.trim();

    try {
      // Find backend display info
      const backendInfo = BACKENDS.find((b) => b.value === backend) ?? BACKENDS[0];
      const workspacePart = currentCwd ? `\n📁 Workspace: ${currentCwd}` : '';
      const modelPart = currentModel ? `\n🧠 Model: ${currentModel}` : '';

      appendEntry({
        type: 'info',
        // message: `${backendInfo.icon} Backend: ${backendInfo.label}\n📝 Prompt: ${currentPrompt}${currentCwd ? `\n📁 Workspace: ${currentCwd}` : ''}` 
        message: `${backendInfo.icon} Backend: ${backendInfo.label}\n📝 Prompt: ${currentPrompt}${workspacePart}${modelPart}`,
      });

      const task = await createTask({ 
        prompt: currentPrompt,
        cwd: currentCwd || undefined,
        backend,
        model: currentModel || undefined,
      });
      setTaskId(task.task_id);
      setCurrentTaskBackend(backend);
      appendEntry({ type: 'info', message: `🔄 Task ${task.task_id} started` });
      if (task.task) {
        setLatestStatus({ state: task.task.state, ts: task.task.updatedAt, error: task.task.errorMessage ?? undefined });
      }
      // Don't clear the prompt - let user edit and resubmit
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!taskId || !canCancel(latestStatus)) {
      return;
    }

    setIsCancelling(true);
    appendEntry({ type: 'info', message: 'Cancellation requested…' });

    try {
      await cancelTask(taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel task';
      setError(message);
      setIsCancelling(false);
    }
  };

  const handleClearHistory = () => {
    setEntries([]);
    setTaskId(null);
    setLatestStatus(null);
    setHeartbeatTs(null);
  };

  const modelPlaceholder = (() => {
    if (backend === 'openai-api') {
      return 'e.g. GPT-5.1 (if configured on the server)';
    }
    if (backend === 'anthropic-api') {
      return 'e.g. Claude 4.5 Sonnet (if configured)';
    }
    if (backend === 'gemini-api' || backend === 'gemini-cli') {
      return 'e.g. gemini-2.5-pro, Gemini 3 (if configured)';
    }
    return 'Leave empty to use the backend default model';
  })();

  return (
    <>
      <Header />
      <div className="task-console">
        <form onSubmit={handleSubmit} className="task-form">
        <label className="form-field">
          <span className="form-label">Backend</span>
          <select
            value={backend}
            onChange={(e) => handleBackendChange(e.target.value as AnyBackend)}
            className="form-select"
            disabled={isSubmitting}
          >
            {BACKENDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.icon} {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">
            Workspace Directory (optional)
            <span className="form-hint"> — Default: ~/llm-workspace</span>
          </span>
          <input
            type="text"
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            className="form-input"
            placeholder="~/llm-workspace"
            disabled={isSubmitting}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Model (optional)</span>
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="form-input"
            placeholder={modelPlaceholder}
            disabled={isSubmitting}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="form-textarea"
            placeholder="Describe the task for the LLM"
            disabled={isSubmitting}
          />
        </label>
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Run Task'}
        </button>
      </form>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="action-buttons">
        {taskId && canCancel(latestStatus) ? (
          <button
            type="button"
            className="secondary-button"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? 'Cancelling…' : 'Cancel Task'}
          </button>
        ) : null}
        {entries.length > 0 ? (
          <button
            type="button"
            className="secondary-button"
            onClick={handleClearHistory}
          >
            Clear History
          </button>
        ) : null}
      </div>

      <div className="stream-section">
        <h2 className="section-title">Stream</h2>
        
        {(latestStatus || heartbeatTs) && (
          <div className="stream-meta">
            {currentTaskBackend ? (
              <p className="stream-backend">
                Backend: {BACKENDS.find((b) => b.value === currentTaskBackend)?.label ?? currentTaskBackend}
              </p>
            ) : null}
            {latestStatus ? (
              <p className="stream-current">
                Status: {latestStatus.state}
                {latestStatus.error ? ` – ${latestStatus.error}` : ''}
              </p>
            ) : null}
            {heartbeatTs ? (
              <p className="stream-heartbeat">
                Last heartbeat: {new Date(heartbeatTs).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        )}
        <div 
          className="stream-panel"
          ref={streamPanelRef}
          onScroll={(e) => {
            const target = e.currentTarget;
            const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
            autoScrollRef.current = isAtBottom;
          }}
        >
          {entries.length === 0 ? (
            <p className="stream-empty">No output yet.</p>
          ) : (
            <ul className="stream-list">
              {entries.map((entry, index) => (
                <li key={`${index}-${entry.type}`}>{renderEntry(entry)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function renderEntry(entry: ConsoleEntry) {
  if (entry.type === 'info') {
    return <span className="stream-info">{entry.message}</span>;
  }

  if (entry.type === 'log') {
    return (
      <span className={entry.data.stream === 'stderr' ? 'stream-log-error' : 'stream-log'}>
        {entry.data.line}
      </span>
    );
  }

  if (entry.type === 'status') {
    return (
      <span className="stream-status">
        Status: {entry.data.state}
        {entry.data.error ? ` – ${entry.data.error}` : ''}
      </span>
    );
  }

  if (entry.type === 'done') {
    if (entry.data.state === 'canceled') {
      return <span className="stream-status">Task canceled</span>;
    }
    return (
      <span className="stream-done">
        Exit code: {entry.data.exit_code}
        {entry.data.state ? ` (${entry.data.state})` : ''}
      </span>
    );
  }

  return null;
}

function canCancel(status: TaskStatusEvent | null): boolean {
  if (!status) {
    return false;
  }
  return status.state === 'queued' || status.state === 'running';
}
