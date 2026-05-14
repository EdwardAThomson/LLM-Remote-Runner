'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AnyBackend,
  deleteTask,
  listTasks,
  ListTasksResponse,
  TaskState,
  TaskSummary,
} from '../lib/sdk';
import Header from './Header';

const PAGE_SIZE = 50;

const BACKEND_LABELS: Record<AnyBackend, string> = {
  codex: 'Codex CLI',
  'claude-cli': 'Claude CLI',
  'gemini-cli': 'Gemini CLI',
  'openai-api': 'OpenAI API',
  'anthropic-api': 'Anthropic API',
  'gemini-api': 'Gemini API',
};

const STATE_OPTIONS: TaskState[] = [
  'queued',
  'running',
  'completed',
  'error',
  'canceled',
];

const BACKEND_OPTIONS: AnyBackend[] = [
  'codex',
  'claude-cli',
  'gemini-cli',
  'openai-api',
  'anthropic-api',
  'gemini-api',
];

export default function Dashboard() {
  const [items, setItems] = useState<TaskSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendFilter, setBackendFilter] = useState<AnyBackend | ''>('');
  const [stateFilter, setStateFilter] = useState<TaskState | ''>('');
  const [pendingDelete, setPendingDelete] = useState<TaskSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response: ListTasksResponse = await listTasks({
        limit: PAGE_SIZE,
        backend: backendFilter || undefined,
        state: stateFilter || undefined,
      });
      setItems(response.items);
      setNextCursor(response.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [backendFilter, stateFilter]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listTasks({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        backend: backendFilter || undefined,
        state: stateFilter || undefined,
      });
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more tasks');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteTask(pendingDelete.id);
      setItems((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Header />
      <div className="dashboard">
        <div className="dashboard-toolbar">
          <div className="dashboard-filters">
            <label className="filter-field">
              <span className="filter-label">Backend</span>
              <select
                className="filter-select"
                value={backendFilter}
                onChange={(e) => setBackendFilter(e.target.value as AnyBackend | '')}
              >
                <option value="">All</option>
                {BACKEND_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {BACKEND_LABELS[b]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-label">State</span>
              <select
                className="filter-select"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as TaskState | '')}
              >
                <option value="">All</option>
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={loadFirstPage}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <Link href="/tasks/new" className="primary-button dashboard-new-button">
            New Task
          </Link>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        {items.length === 0 && !loading ? (
          <div className="dashboard-empty">
            <p>No tasks yet.</p>
            <Link href="/tasks/new" className="primary-button">
              Run your first task
            </Link>
          </div>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Backend</th>
                  <th>Model</th>
                  <th>Prompt</th>
                  <th>State</th>
                  <th>Duration</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link href={`/tasks/${task.id}`} className="task-row-link">
                        {formatRelativeTime(task.createdAt)}
                      </Link>
                    </td>
                    <td>{BACKEND_LABELS[task.backend] ?? task.backend}</td>
                    <td className="task-model">{task.model ?? '—'}</td>
                    <td className="task-prompt" title={task.prompt}>
                      {truncate(task.prompt, 80)}
                    </td>
                    <td>
                      <span className={`state-badge state-${task.state}`}>
                        {task.state}
                      </span>
                    </td>
                    <td>{formatDuration(task.createdAt, task.updatedAt, task.state)}</td>
                    <td>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => setPendingDelete(task)}
                        disabled={task.state === 'queued' || task.state === 'running'}
                        title={
                          task.state === 'queued' || task.state === 'running'
                            ? 'Cancel the task before deleting'
                            : 'Delete task'
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor ? (
          <button
            type="button"
            className="secondary-button"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>

      {pendingDelete ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isDeleting) {
              setPendingDelete(null);
            }
          }}
        >
          <div className="modal-card modal-card-narrow">
            <div className="modal-header">
              <h2 id="delete-modal-title" className="modal-title">Delete task?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                This will permanently delete the task and all of its logs. This action cannot be undone.
              </p>
              <p className="modal-task-preview" title={pendingDelete.prompt}>
                <strong>Prompt:</strong> {truncate(pendingDelete.prompt, 140)}
              </p>
            </div>
            <div className="modal-footer modal-footer-spread">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(
  createdAt: string,
  updatedAt: string,
  state: TaskState,
): string {
  const start = new Date(createdAt).getTime();
  const end =
    state === 'queued' || state === 'running'
      ? Date.now()
      : new Date(updatedAt).getTime();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
