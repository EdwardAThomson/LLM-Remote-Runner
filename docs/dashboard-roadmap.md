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
- [x] Pagination on `GET /api/tasks`: `limit` (1–200, default 50), opaque base64url `cursor` encoding `{createdAt,id}`. Returns `{ items, next_cursor }`. See [tasks.controller.ts](../gateway/src/tasks/tasks.controller.ts) + [tasks.repository.ts](../gateway/src/tasks/tasks.repository.ts).
- [x] Filters `?backend=` and `?state=` validated via [list-tasks-query.dto.ts](../gateway/src/tasks/dto/list-tasks-query.dto.ts). (Prompt search `?q=` still pending — see A.4.)
- [x] `DELETE /api/tasks/:id` ([tasks.controller.ts](../gateway/src/tasks/tasks.controller.ts)) — 204 No Content; throws `BadRequestException` if task is still queued/running.

### A.2 SDK
- [x] `listTasks({ limit, cursor, backend, state })` → `{ items, next_cursor }` in [sdk/src/index.ts](../sdk/src/index.ts).
- [x] `getTask(id)` → `TaskDetail` (includes logs).
- [x] `deleteTask(id)`.
- [x] Web wrapper [web/lib/sdk.ts](../web/lib/sdk.ts) re-exports all three with cookie-based JWT.

### A.3 Web routing
- [x] TaskConsole moved to `/tasks/new` ([web/app/tasks/new/page.tsx](../web/app/tasks/new/page.tsx)). Honors `?prompt=&backend=&model=&cwd=` query params for the "Run Again" handoff.
- [x] Dashboard at `/` ([web/components/Dashboard.tsx](../web/components/Dashboard.tsx)) with table (created/backend/model/prompt/state badge/duration), backend + state filters, "Load more" via cursor, modal-driven delete. Note: today only the Created timestamp links to the detail page — whole-row click is a nice-to-have left for later if you want it.
- [x] `/tasks/[id]` ([web/components/TaskDetail.tsx](../web/components/TaskDetail.tsx)): replays stored logs via `getTask`, attaches to SSE if `state === queued|running`, Cancel + Run-Again + Refresh actions.
- [x] `Header.tsx` nav with Dashboard / New Task links and active-state highlighting.

### A.4 Polish (after the table works)
- [ ] Prompt search (`q=`) — SQLite `LIKE %q%` on prompt is fine at our scale; FTS5 only if needed.
- [ ] Auto-refresh dashboard (poll every ~10s or use SSE summary stream — defer; polling is fine for v1).
- [x] Empty state with "Run your first task" CTA (dashed-border card with primary-button link).
- [x] Delete confirmation modal (replaces the browser `confirm()` prompt).

---

## Phase A.5 — Programmatic API for service-to-service use

The gateway is already an HTTP API, but the auth model (password → short-lived JWT) and lack of completion callbacks make it awkward for non-interactive callers. This phase makes the existing surface usable by other apps without changing what the dashboard does.

### A.5.1 API tokens (machine credentials)
- [x] Schema: `api_tokens` table via [migration 002](../gateway/src/db/migrations.ts) — `id`, `name`, `token_hash` (bcrypt), `created_at`, `last_used_at`, `revoked_at`. Token format: `rrt_<id>_<secret>` where the 16-char `id` doubles as a non-secret lookup key and only the secret is bcrypt-compared (avoids scanning every row).
- [x] [`ApiTokenStrategy`](../gateway/src/auth/api-tokens/api-token.strategy.ts) (Passport custom) plus a multi-strategy global [`JwtAuthGuard`](../gateway/src/auth/jwt.guard.ts) (`AuthGuard(['jwt', 'api-token'])`). Principal set as `{ type: 'token', tokenId, name }` so callers are distinguishable. Tasks controller drops its own controller-level JWT guard and relies on the global one.
- [x] Endpoints in [`ApiTokensController`](../gateway/src/auth/api-tokens/api-tokens.controller.ts): `POST /api/tokens` (plaintext returned **once**), `GET /api/tokens`, `DELETE /api/tokens/:id`. All JWT-only via the strict `JwtAuthGuard` from `jwt-auth.guard.ts` layered on top of the global one — API-token callers can't mint or revoke tokens.
- [x] [`/settings/tokens`](../web/app/settings/tokens/page.tsx) UI ([`TokensSettings`](../web/components/TokensSettings.tsx)): list with name/created/last-used/status, create form, revoke confirmation modal, plaintext-once reveal modal with copy button.
- [x] **Verified end-to-end:** valid token → 200 on `/api/tasks` and `last_used_at` updates; token on `/api/tokens` → 401; wrong secret → 401; revoked token → 401.

### A.5.2 Webhooks
- [x] Optional `webhookUrl` + `webhookSecret` on [`CreateTaskDto`](../gateway/src/tasks/dto/create-task.dto.ts) (URL validated as http/https). Persisted via [migration 003](../gateway/src/db/migrations.ts) — `webhook_url`, `webhook_secret`, `webhook_last_status`, `webhook_last_attempt_at` columns on `tasks`. Secret never returned in any API response (verified — `findSummary`/`findDetail` only map public fields; `findWebhook` is internal-only).
- [x] On finalize, [`WebhooksService.fire`](../gateway/src/tasks/webhooks.service.ts) POSTs `{ task_id, state, exit_code, error_message }`, signed with HMAC-SHA256 in `X-Runner-Signature: sha256=<hex>`. User-Agent set to `llm-remote-runner/1.0`. 10s per-attempt timeout via `AbortController`.
- [x] Retry: 1 + 3 attempts at 1s/5s/30s backoff. Failures never propagate; `webhook_last_status` records final HTTP status (0 = network/abort error) and `webhook_last_attempt_at` timestamps the last attempt.
- [x] Smoke-tested end-to-end against a local Python listener: delivered body matched spec, signature verified server-side, DB row updated with `status=200`. Retry path also exercised (listener offline → 4 attempts → `status=0` recorded).
- [x] **Open question #5 resolved for now**: only last delivery status persisted; no per-attempt log table. Revisit if users want retry visibility.

### A.5.3 OpenAPI + CORS
- [x] `@nestjs/swagger` wired in [main.ts](../gateway/src/main.ts). Swagger UI at `/api/docs`, JSON spec at `/api/docs/json`. Both are gated by a **password-only HTML login form** at `/api/docs/login` ([docs-session.ts](../gateway/src/auth/docs-session.ts)) that issues an HttpOnly `runner_docs_session` cookie carrying the same JWT the API uses. Same admin password as the web login; same JWT lifecycle (24h). Matches the rest of the app's UX (no browser auth dialog, no username field).
- [x] `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth('bearer')` annotations on every controller (tasks / auth / tokens / health). `@ApiProperty`/`@ApiPropertyOptional` on every DTO field with descriptions, enums, and examples. Spec exposes 12 operations across 4 tags.
- [x] CORS allowlist via `CORS_ORIGINS` env var (comma-separated). Empty = no cross-origin allowed. Configured in [app.config.ts](../gateway/src/config/app.config.ts) + [env.validation.ts](../gateway/src/config/env.validation.ts); `.env` and `.env.example` updated. Verified: allowed origin gets `Access-Control-Allow-Origin` header echoed back; disallowed origins don't.

### A.5.4 Rate limiting per principal
- [ ] Current throttler is global. Switch to per-principal (per-JWT-user or per-token-id) so a noisy service doesn't starve the dashboard. Use `@nestjs/throttler`'s `getTracker()`.

### A.5.5 Docs
- [ ] New `docs/api.md`: quickstart for service integrations — minting a token, creating a task with a webhook, verifying the signature, polling vs. SSE.

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

1. **Log retention** (Phase 0.3): do we cap logs per task (truncate after N lines / N MB)? Long-running tasks could produce huge transcripts.
2. **Conversation forking** (Phase B.5): when the user edits an earlier message, do we branch (preserve original) or overwrite? Start with overwrite.
3. **Transcript size for CLI adapters** (Phase B.2): at some point the serialized prompt will hit context limits. Truncate silently, or surface a warning?
4. **System prompts per conversation vs per task** (Phase B.2): stored on the conversation row sounds right, but worth confirming before B.1 ships.
5. ~~**Webhook delivery log** (Phase A.5.2)~~ — resolved: only last status persisted on the task row; revisit if retry visibility is requested.
