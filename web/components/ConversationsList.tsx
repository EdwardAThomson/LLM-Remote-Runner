import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ConversationSummary,
  createConversation,
  deleteConversation,
  listConversations,
} from '../lib/sdk';
import Header from './Header';

const PAGE_SIZE = 50;

export default function ConversationsList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listConversations({ limit: PAGE_SIZE });
      setItems(response.items);
      setNextCursor(response.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const response = await listConversations({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    try {
      const created = await createConversation({
        title: title.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      setShowCreate(false);
      setTitle('');
      setSystemPrompt('');
      navigate(`/conversations/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteConversation(pendingDelete.id);
      setItems((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
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
            <button
              type="button"
              className="secondary-button"
              onClick={loadFirst}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <button
            type="button"
            className="primary-button dashboard-new-button"
            onClick={() => setShowCreate(true)}
          >
            New Conversation
          </button>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        {items.length === 0 && !loading ? (
          <div className="dashboard-empty">
            <p>No conversations yet.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowCreate(true)}
            >
              Start your first conversation
            </button>
          </div>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>System prompt</th>
                  <th>Last updated</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((conv) => (
                  <tr key={conv.id}>
                    <td>
                      <Link to={`/conversations/${conv.id}`} className="task-row-link">
                        {conv.title || '(untitled)'}
                      </Link>
                    </td>
                    <td className="task-prompt" title={conv.systemPrompt ?? ''}>
                      {conv.systemPrompt ? truncate(conv.systemPrompt, 60) : '—'}
                    </td>
                    <td>{formatRelativeTime(conv.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => setPendingDelete(conv)}
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

      {showCreate ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-conv-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isCreating) setShowCreate(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="create-conv-title" className="modal-title">New conversation</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCreate(false)}
                disabled={isCreating}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <label className="form-field form-field-dark">
                  <span className="form-label-dark">Title (optional)</span>
                  <input
                    type="text"
                    className="form-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-derived from your first message if blank"
                    maxLength={200}
                  />
                </label>
                <label className="form-field form-field-dark">
                  <span className="form-label-dark">System prompt (optional)</span>
                  <textarea
                    className="form-textarea"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Instructions the LLM sees on every turn"
                    rows={4}
                    maxLength={8192}
                  />
                </label>
              </div>
              <div className="modal-footer modal-footer-spread">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-conv-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isDeleting) setPendingDelete(null);
          }}
        >
          <div className="modal-card modal-card-narrow">
            <div className="modal-header">
              <h2 id="delete-conv-title" className="modal-title">Delete conversation?</h2>
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
                All messages in <strong>{pendingDelete.title || '(untitled)'}</strong> will be permanently deleted.
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
