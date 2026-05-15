import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

type ModelOption = {
  backend: AnyBackend;
  value: string;
  label: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  { backend: 'openai-api', value: 'gpt-5.5', label: 'OpenAI - GPT-5.5' },
  { backend: 'openai-api', value: 'gpt-5.4', label: 'OpenAI - GPT-5.4' },
  { backend: 'openai-api', value: 'gpt-5.2', label: 'OpenAI - GPT-5.2' },
  { backend: 'gemini-api', value: 'gemini-3.1-pro-preview', label: 'Gemini - 3.1 Pro Preview' },
  { backend: 'gemini-api', value: 'gemini-3-pro-preview', label: 'Gemini - 3 Pro Preview' },
  { backend: 'gemini-api', value: 'gemini-3-flash-preview', label: 'Gemini - 3 Flash Preview' },
  { backend: 'gemini-api', value: 'gemini-2.5-pro', label: 'Gemini - 2.5 Pro' },
  { backend: 'gemini-api', value: 'gemini-2.5-flash', label: 'Gemini - 2.5 Flash' },
  { backend: 'gemini-cli', value: 'gemini-3.1-pro-preview', label: 'Gemini CLI - 3.1 Pro Preview' },
  { backend: 'gemini-cli', value: 'gemini-3-pro-preview', label: 'Gemini CLI - 3 Pro Preview' },
  { backend: 'gemini-cli', value: 'gemini-3-flash-preview', label: 'Gemini CLI - 3 Flash Preview' },
  { backend: 'gemini-cli', value: 'gemini-2.5-pro', label: 'Gemini CLI - 2.5 Pro' },
  { backend: 'gemini-cli', value: 'gemini-2.5-flash', label: 'Gemini CLI - 2.5 Flash' },
  {
    backend: 'anthropic-api',
    value: 'claude-sonnet-4-5-20250929',
    label: 'Claude - Sonnet 4.5',
  },
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
  const [showSettings, setShowSettings] = useState(false);
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

  const [searchParams] = useSearchParams();

  // Load stored backend preference on mount, then layer query params on top
  // (for the "Run Again" flow from a task detail page).
  useEffect(() => {
    setBackend(getStoredBackend());
    const qPrompt = searchParams.get('prompt');
    const qBackend = searchParams.get('backend') as AnyBackend | null;
    const qModel = searchParams.get('model');
    const qCwd = searchParams.get('cwd');
    if (qPrompt) setPrompt(qPrompt);
    if (qBackend && BACKENDS.some((b) => b.value === qBackend)) {
      setBackend(qBackend);
    }
    if (qModel) setModel(qModel);
    if (qCwd) setCwd(qCwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const backendModelOptions = MODEL_OPTIONS.filter(
    (option) => option.backend === backend,
  );

  const modelPlaceholder = (() => {
    if (backend === 'openai-api') {
      return 'e.g. gpt-5.5 (if configured on the server)';
    }
    if (backend === 'anthropic-api') {
      return 'e.g. Claude 4.5 Sonnet (if configured)';
    }
    if (backend === 'gemini-api' || backend === 'gemini-cli') {
      return 'e.g. gemini-3.1-pro-preview, gemini-3-flash-preview (if configured)';
    }
    return 'Leave empty to use the backend default model';
  })();

  return (
    <>
      <Header />
      <div className="task-console">
        <form onSubmit={handleSubmit} className="task-form">
          <div className="task-form-controls">
            <label className="form-field form-field-inline">
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
            <button
              type="button"
              className="settings-button"
              onClick={() => setShowSettings(true)}
              disabled={isSubmitting}
              title="Workspace & model settings"
            >
              <span className="settings-button-icon" aria-hidden>⚙️</span>
              <span className="settings-button-label">
                <span className="settings-button-title">Settings</span>
                {(() => {
                  const parts: string[] = [];
                  if (model.trim()) parts.push(`model: ${model.trim()}`);
                  if (cwd.trim()) parts.push(`cwd: ${cwd.trim()}`);
                  return parts.length > 0 ? (
                    <span className="settings-button-summary">{parts.join(' · ')}</span>
                  ) : null;
                })()}
              </span>
            </button>
          </div>
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

        {showSettings ? (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowSettings(false);
            }}
          >
            <div className="modal-card">
              <div className="modal-header">
                <h2 id="settings-modal-title" className="modal-title">Task settings</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-note">
                  Leave fields empty to use the CLI's configured defaults.
                </p>
                <label className="form-field form-field-dark">
                  <span className="form-label-dark">
                    Workspace Directory (optional)
                    <span className="form-hint-dark"> — Default: ~/llm-workspace</span>
                  </span>
                  <input
                    type="text"
                    value={cwd}
                    onChange={(event) => setCwd(event.target.value)}
                    className="form-input"
                    placeholder="~/llm-workspace"
                  />
                </label>
                {backendModelOptions.length > 0 ? (
                  <label className="form-field form-field-dark">
                    <span className="form-label-dark">Model preset</span>
                    <select
                      className="form-select"
                      value={
                        backendModelOptions.some((option) => option.value === model)
                          ? model
                          : ''
                      }
                      onChange={(event) => setModel(event.target.value)}
                    >
                      <option value="">Use backend default</option>
                      {backendModelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="form-field form-field-dark">
                  <span className="form-label-dark">Model (optional)</span>
                  <input
                    type="text"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="form-input"
                    placeholder={modelPlaceholder}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowSettings(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
