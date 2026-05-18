import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AnyBackend,
  ConversationDetail,
  ConversationViewMode,
  getConversation,
  MessageRecord,
  sendMessage,
  streamTask,
  updateConversation,
} from '../lib/sdk';
import Header from './Header';

const BACKENDS: { value: AnyBackend; label: string }[] = [
  { value: 'codex', label: 'Codex CLI' },
  { value: 'claude-cli', label: 'Claude CLI' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'openai-api', label: 'OpenAI API' },
  { value: 'anthropic-api', label: 'Anthropic API' },
  { value: 'gemini-api', label: 'Gemini API' },
];

const STORAGE_BACKEND = 'llm-runner-conv-backend';
const STORAGE_MODEL = 'llm-runner-conv-model';

type ViewMode = ConversationViewMode;

export default function ConversationView() {
  const { id: conversationId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [backend, setBackend] = useState<AnyBackend>('codex');
  const [model, setModel] = useState('');
  const [pendingAssistant, setPendingAssistant] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamCleanup = useRef<(() => void) | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedBackend = localStorage.getItem(STORAGE_BACKEND) as AnyBackend | null;
    if (storedBackend && BACKENDS.some((b) => b.value === storedBackend)) {
      setBackend(storedBackend);
    }
    const storedModel = localStorage.getItem(STORAGE_MODEL);
    if (storedModel) setModel(storedModel);
  }, []);

  // The view mode now lives on the conversation row. Mirror it into local
  // state so the UI can update optimistically without waiting for the PATCH
  // round-trip. Conversation load syncs the canonical value back in.
  useEffect(() => {
    if (conversation) setViewMode(conversation.viewMode);
  }, [conversation?.viewMode]);

  // The `?view=` query param is a one-time hint from the "Continue as
  // conversation" flow — apply it once on mount, persist via PATCH, and
  // strip it from the URL so a refresh doesn't keep forcing the choice.
  useEffect(() => {
    if (!conversationId || !conversation) return;
    const queryView = searchParams.get('view');
    if (queryView !== 'chat' && queryView !== 'console') return;
    if (conversation.viewMode !== queryView) {
      void persistViewMode(queryView);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const persistViewMode = useCallback(
    async (next: ViewMode) => {
      if (!conversationId) return;
      setViewMode(next); // optimistic
      try {
        const updated = await updateConversation(conversationId, {
          viewMode: next,
        });
        setConversation((prev) => (prev ? { ...prev, ...updated } : prev));
      } catch (err) {
        // Roll back optimistic change on failure.
        if (conversation) setViewMode(conversation.viewMode);
        setLoadError(
          err instanceof Error ? err.message : 'Failed to change view mode',
        );
      }
    },
    [conversationId, conversation],
  );

  const handleViewModeChange = (next: ViewMode) => {
    void persistViewMode(next);
  };

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoadError(null);
    try {
      const detail = await getConversation(conversationId);
      setConversation(detail);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-scroll on new messages or streaming tokens.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [conversation?.messages.length, pendingAssistant]);

  // Tear down any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      streamCleanup.current?.();
    };
  }, []);

  const handleBackendChange = (next: AnyBackend) => {
    setBackend(next);
    localStorage.setItem(STORAGE_BACKEND, next);
    // Don't reset model — user might want to keep an explicit override across backends.
  };

  const handleModelChange = (next: string) => {
    setModel(next);
    if (next) localStorage.setItem(STORAGE_MODEL, next);
    else localStorage.removeItem(STORAGE_MODEL);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !conversationId || isSending) return;

    setIsSending(true);
    setSendError(null);

    try {
      const response = await sendMessage(conversationId, {
        content: trimmed,
        backend,
        model: model.trim() || undefined,
      });
      setContent('');
      setActiveTaskId(response.task_id);
      setPendingAssistant('');
      // Refresh so the user message appears immediately.
      await load();

      // Subscribe to the assistant turn's live stream.
      streamCleanup.current?.();
      streamCleanup.current = streamTask(
        response.task_id,
        {
          onLog: (event) => {
            if (event.stream !== 'stderr' && typeof event.line === 'string') {
              setPendingAssistant((prev) => (prev ?? '') + event.line + '\n');
            }
          },
          onDone: async () => {
            // Server has now persisted the assistant message; refetch to pick it up
            // (canonical content, id, task_id), then drop the pending bubble.
            await load();
            setPendingAssistant(null);
            setActiveTaskId(null);
            streamCleanup.current?.();
            streamCleanup.current = undefined;
          },
          onError: () => {
            // EventSource will retry; nothing user-actionable to surface.
          },
        },
        {},
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
      setPendingAssistant(null);
      setActiveTaskId(null);
    } finally {
      setIsSending(false);
    }
  };

  if (!conversationId) return null;

  const isStreaming = pendingAssistant !== null || isSending;

  return (
    <>
      <Header />
      <div className="chat">
        <div className="chat-back">
          <Link to="/" className="link-button">← Conversations</Link>
        </div>

        {loadError ? <p className="error-banner">{loadError}</p> : null}

        {conversation ? (
          <>
            <div className="chat-meta">
              <div className="chat-meta-head">
                <h2 className="chat-title">{conversation.title || '(untitled)'}</h2>
                <div className="chat-view-toggle" role="tablist" aria-label="View mode">
                  <button
                    type="button"
                    className={`chat-view-tab${viewMode === 'chat' ? ' chat-view-tab-active' : ''}`}
                    onClick={() => handleViewModeChange('chat')}
                    aria-selected={viewMode === 'chat'}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    className={`chat-view-tab${viewMode === 'console' ? ' chat-view-tab-active' : ''}`}
                    onClick={() => handleViewModeChange('console')}
                    aria-selected={viewMode === 'console'}
                  >
                    Console
                  </button>
                </div>
              </div>
              {conversation.systemPrompt ? (
                <details className="chat-system">
                  <summary>System prompt</summary>
                  <pre className="chat-system-body">{conversation.systemPrompt}</pre>
                </details>
              ) : null}
            </div>

            <div
              className={`chat-transcript${viewMode === 'console' ? ' chat-transcript-console' : ''}`}
              ref={transcriptRef}
            >
              {conversation.messages.length === 0 && !pendingAssistant ? (
                <p className="chat-empty">No messages yet — say hello.</p>
              ) : viewMode === 'chat' ? (
                <ul className="chat-list">
                  {conversation.messages
                    .filter((m) => m.role !== 'system')
                    .map((m) => (
                      <li key={m.id} className={`chat-msg chat-msg-${m.role}`}>
                        <ChatBubble message={m} />
                      </li>
                    ))}
                  {pendingAssistant !== null ? (
                    <li className="chat-msg chat-msg-assistant chat-msg-pending">
                      <div className="chat-bubble">
                        {pendingAssistant ? (
                          <pre className="chat-content">{pendingAssistant}</pre>
                        ) : (
                          <span className="chat-thinking">Thinking…</span>
                        )}
                        <div className="chat-meta-row">
                          <span className="chat-role">assistant</span>
                          <span className="chat-streaming">streaming</span>
                        </div>
                      </div>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <div className="console-transcript">
                  {conversation.messages
                    .filter((m) => m.role !== 'system')
                    .map((m) =>
                      m.role === 'user' ? (
                        <div key={m.id} className="console-prompt">
                          <span className="console-prompt-marker">{'>'}</span>
                          <pre className="console-prompt-text">{m.content}</pre>
                        </div>
                      ) : (
                        <pre key={m.id} className="console-output">
                          {m.content}
                        </pre>
                      ),
                    )}
                  {pendingAssistant !== null ? (
                    <pre className="console-output console-output-pending">
                      {pendingAssistant || '⏳ thinking…'}
                    </pre>
                  ) : null}
                </div>
              )}
            </div>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <div className="chat-composer-controls">
                <label className="filter-field">
                  <span className="filter-label">Backend</span>
                  <select
                    className="filter-select"
                    value={backend}
                    onChange={(e) => handleBackendChange(e.target.value as AnyBackend)}
                    disabled={isSending}
                  >
                    {BACKENDS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </label>
                <label className="filter-field chat-model-field">
                  <span className="filter-label">Model (optional)</span>
                  <input
                    type="text"
                    className="form-input"
                    value={model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder="Backend default"
                    disabled={isSending}
                  />
                </label>
                {activeTaskId ? (
                  <Link
                    to={`/tasks/${activeTaskId}`}
                    className="link-button chat-task-link"
                    title="Open this turn's task detail in a new view"
                  >
                    View task →
                  </Link>
                ) : null}
              </div>
              <textarea
                className="form-textarea chat-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message…"
                rows={3}
                disabled={isSending}
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter submits.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {sendError ? <p className="error-banner">{sendError}</p> : null}
              <div className="chat-actions">
                <span className="chat-hint">⌘/Ctrl + Enter to send</span>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSending || isStreaming || !content.trim()}
                >
                  {isStreaming ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        ) : !loadError ? (
          <p>Loading…</p>
        ) : null}
      </div>
    </>
  );
}

function ChatBubble({ message }: { message: MessageRecord }) {
  return (
    <div className="chat-bubble">
      <pre className="chat-content">{message.content}</pre>
      <div className="chat-meta-row">
        <span className="chat-role">{message.role}</span>
        {message.backend ? (
          <span className="chat-backend">{message.backend}</span>
        ) : null}
        {message.model ? <span className="chat-model">{message.model}</span> : null}
        <span className="chat-time">{new Date(message.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
