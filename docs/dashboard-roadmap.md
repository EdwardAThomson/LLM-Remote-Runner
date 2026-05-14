# Dashboard & Conversations Roadmap

> Goal: replace the single-page task console with a dashboard of task history (Phase A), then evolve to multi-turn conversations with backend-managed state so the user can swap models mid-thread (Phase B).

## Current state (baseline)

- Tasks are kept in an in-memory `Map` in [gateway/src/tasks/tasks.service.ts](../gateway/src/tasks/tasks.service.ts) and lost on restart. Logs are buffered in the same record.
- Endpoints already exist: `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `POST /api/tasks/:id/cancel`, `GET /api/tasks/:id/stream`. All JWT-guarded.
- SDK ([sdk/src/index.ts](../sdk/src/index.ts)) wraps create/stream/cancel only — no `listTasks` / `getTask`.
- Web ([web/app/](../web/app/)) has two routes: `/` (TaskConsole) and `/login`. JWT cookie auth via [web/components/AuthGuard.tsx](../web/components/AuthGuard.tsx).
- Each task is one-shot: one prompt → one subprocess → one output. No conversation concept.

---

## Phase 0 — Persistence foundation

Prerequisite for everything else. Without this, the dashboard is empty after every gateway restart.

### 0.1 Storage choice
- [x] Adopt **SQLite via `better-sqlite3`** (synchronous, zero-ops, one file). Migrations live in [gateway/src/db/migrations.ts](../gateway/src/db/migrations.ts) as embedded SQL strings (avoids needing to copy `.sql` files into `dist/` at build time).
- [x] Configure DB path via env var (`DB_PATH`, default `./data/runner.db`).
- [ ] Document `DB_PATH` in `RUNNING.md`.

### 0.2 Schema (initial)
```sql
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  prompt          TEXT NOT NULL,
  backend         TEXT NOT NULL,
  model           TEXT,
  cwd             TEXT,
  state           TEXT NOT NULL,        -- queued|running|completed|error|canceled
  exit_code       INTEGER,
  error_message   TEXT,
  created_at      TEXT NOT NULL,        -- ISO8601
  updated_at      TEXT NOT NULL,
  -- Phase B additions arrive later, nullable for now:
  conversation_id TEXT,
  parent_task_id  TEXT
);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_conversation ON tasks(conversation_id, created_at);

CREATE TABLE task_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ts        TEXT NOT NULL,
  stream    TEXT NOT NULL,              -- stdout|stderr
  line      TEXT NOT NULL
);
CREATE INDEX idx_task_logs_task ON task_logs(task_id, id);
```

### 0.3 Repository layer
- [x] `TasksRepository` ([gateway/src/tasks/tasks.repository.ts](../gateway/src/tasks/tasks.repository.ts)) wraps all DB access. `TasksService` reads from the repo for non-live tasks; live tasks stay in the in-memory `Map`.
- [x] Per-line log writes (each `appendLog` writes through to `task_logs`).
- [ ] Decide log retention policy (open question #1). Default for now: no cap. Revisit if a single task produces > ~10 MB of logs and the dashboard slows down.

### 0.4 Hydration
- [x] On gateway boot, `TasksRepository.markInterruptedAsError` flips any `queued`/`running` rows to `error` with message "Interrupted by gateway restart". Wired via `TasksService.onModuleInit`. Verified with a seeded row.

---

## Phase A — One-shot task dashboard

Smallest path to a working dashboard. Confirms the UX before we invest in conversations.

### A.1 Gateway API
- [ ] Add pagination to `GET /api/tasks`: query params `limit` (default 50, max 200), `cursor` (opaque, encodes `created_at`+`id`). Return `{ items, next_cursor }`.
- [ ] Add filters: `?backend=`, `?state=`. Search (`?q=`) on prompt — defer to Phase A.4 if it complicates indexing.
- [ ] Add `DELETE /api/tasks/:id` for housekeeping. Refuses while task is running.

### A.2 SDK
- [ ] Export `listTasks({ limit, cursor, backend, state })` → `{ items: TaskSummary[], next_cursor }`.
- [ ] Export `getTask(id)` → `TaskDetail` (includes logs).
- [ ] Export `deleteTask(id)`.

### A.3 Web routing
- [ ] Move TaskConsole from `/` to `/tasks/new`.
- [ ] New `/` route: dashboard page with table. Columns: created (relative time), backend, model, prompt (truncated, hover-for-full), state (badge), duration. Row click → `/tasks/[id]`.
- [ ] New `/tasks/[id]` route: shows full prompt + metadata, replays stored logs via `getTask`, attaches to SSE if `state === running`. Cancel button. "Run again" button → seeds `/tasks/new` with the same prompt+backend+model.
- [ ] Update `Header.tsx` with nav: Dashboard / New task.

### A.4 Polish (after the table works)
- [ ] Prompt search (`q=`) — SQLite `LIKE %q%` on prompt is fine at our scale; FTS5 only if needed.
- [ ] Auto-refresh dashboard (poll every ~10s or use SSE summary stream — defer; polling is fine for v1).
- [ ] Empty state with "Run your first task" CTA.

---

## Phase B — Conversations (multi-turn, backend-managed state)

State lives in our DB, not in the CLI. Each turn re-invokes the adapter with the full transcript. This makes model-switching mid-thread trivial.

### B.1 Schema additions
```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT,                       -- auto-derived from first message, user-editable
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,          -- user|assistant|system
  content         TEXT NOT NULL,
  task_id         TEXT REFERENCES tasks(id),  -- set for assistant messages: the task that produced this
  backend         TEXT,                   -- which backend produced this (assistant only)
  model           TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

`tasks.conversation_id` / `tasks.parent_task_id` columns from Phase 0 start getting populated.

### B.2 Adapter contract change
- [ ] Extend `CliAdapter` interface to accept `messages: ChatMessage[]` instead of (or alongside) `prompt: string`.
- [ ] Per-adapter transcript handling:
  - **API backends** (OpenAI/Anthropic/Gemini): native `messages` field — pass through.
  - **CLI backends** (Codex / Claude / Gemini CLI): serialize transcript into a single prompt with role markers (e.g. `### User\n…\n### Assistant\n…`). Document the exact format in each adapter.
- [ ] Decide on system-prompt handling: per-conversation `system` message stored in DB, prepended at adapter call time (open question #4 — confirm scope before shipping B.1).
- [ ] Decide behaviour when serialized transcript exceeds the backend's context window (open question #3). Options: silent truncation of oldest messages, hard error, or surfacing a warning in the UI. Pick when first long conversation hits the limit.

### B.3 Gateway API for conversations
- [ ] `POST /api/conversations` — create empty conversation, returns id.
- [ ] `GET /api/conversations` — paginated list with last-message preview.
- [ ] `GET /api/conversations/:id` — full message history.
- [ ] `POST /api/conversations/:id/messages` — body `{ content, backend, model, cwd? }`. Server appends user message, creates a task with the full transcript, streams the assistant turn back. Returns `{ message_id, task_id }`.
- [ ] `PATCH /api/conversations/:id` — rename, edit system prompt.
- [ ] `DELETE /api/conversations/:id`.

### B.4 SDK
- [ ] `listConversations`, `getConversation`, `createConversation`, `sendMessage`, `streamMessage`, `renameConversation`, `deleteConversation`.

### B.5 Web routing
- [ ] `/` dashboard gains a tab toggle: **Conversations** | **Tasks** (or stays on Conversations and Tasks moves to `/tasks`).
- [ ] `/conversations/[id]` — chat-style transcript. Per-turn model selector (defaults to last-used). Streams assistant turn live. "Edit & resend" on user messages — branch vs. overwrite is open question #2; start with overwrite for v1.
- [ ] One-shot tasks page (`/tasks`) stays around for ad-hoc / non-chat work — e.g. "run this prompt in workspace X".

### B.6 Migration of existing tasks
- [ ] Existing tasks without `conversation_id` remain visible on `/tasks`. No back-fill into conversations.

---

## Phase C — Later (not committed)

- Multi-user (each task/conversation has `owner_id`; auth gains usernames).
- Task tagging / starring.
- Export conversation as Markdown / JSON.
- Token/cost accounting per turn.
- Workspace snapshots (capture files written by the CLI per turn).
- Background "watch" mode — schedule a task to re-run periodically.

---

## Open questions

1. **Log retention**: do we cap logs per task (truncate after N lines / N MB)? Long-running tasks could produce huge transcripts.
2. **Conversation forking**: when the user edits an earlier message, do we branch (preserve original) or overwrite? Branching is more powerful but UI-heavier — start with overwrite.
3. **Transcript size for CLI adapters**: at some point the serialized prompt will hit context limits. Do we silently truncate, or surface a warning in the UI?
4. **System prompts per conversation vs per task**: stored on the conversation row sounds right, but worth confirming before B.1 ships.
