# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

pnpm workspace with four packages — see `pnpm-workspace.yaml`:

- `gateway/` (`@codex/gateway`) — NestJS API, the only package with non-trivial logic.
- `sdk/` (`@codex/sdk`) — Shared types + fetch/SSE client wrappers consumed by `web` and external scripts.
- `web/` (`@codex/web`) — **Vite + React 18 + React Router v7** SPA. No Next.js, no App Router; routes live in `web/src/App.tsx`, components in `web/components/`. The web app reads `VITE_GATEWAY_URL` from `web/.env.local` (via `import.meta.env`); the legacy `NEXT_PUBLIC_GATEWAY_URL` / `NEXT_PUBLIC_AUTH_TOKEN` names are no longer read by any code — if you see them in a local `.env.local`, they silently do nothing.
- `mobile/` (`@codex/mobile`) — Expo scaffold, mostly experimental.

## Commands

Run from repo root unless noted. Install with `pnpm install --recursive` (requires `corepack enable pnpm`).

| Task | Command |
| --- | --- |
| Gateway dev (hot reload, port 3000) | `pnpm --filter @codex/gateway dev` |
| Web dev (Vite, port 3001) | `pnpm --filter @codex/web dev` |
| Build everything | `pnpm build` (root) or `pnpm -r run build` |
| Gateway tests (Jest) | `pnpm --filter @codex/gateway test` |
| Single Jest test by name | `pnpm --filter @codex/gateway test -- -t "partial test name"` |
| Single Jest spec file | `pnpm --filter @codex/gateway test -- path/to/file.spec.ts` |
| Web typecheck | `pnpm --filter @codex/web typecheck` |
| Initial auth setup | `cd gateway && pnpm tsx scripts/setup-auth.ts` then `rm scripts/setup-auth.ts` |
| Repair broken `claude` CLI install | `./scripts/fix-claude.sh` |

OpenAPI / Swagger UI is at `http://localhost:3000/api/docs` once the gateway is up (JSON at `/api/docs/json`).

## Gateway architecture

NestJS modules wired in `gateway/src/app.module.ts`. Global `JwtAuthGuard` + `PrincipalThrottlerGuard` apply to every route unless decorated `@Public()`.

### Backend adapters (`gateway/src/adapters/`)

Two parallel hierarchies, each with its own factory:

- **CLI adapters** (`AdapterFactory`): `codex`, `claude-cli`, `gemini-cli`. Each implements `CliAdapter.buildCommand()` → `{ command, args, env }`. The service spawns the subprocess and streams stdout/stderr line-by-line over SSE.
- **API adapters** (`ApiAdapterFactory`): `openai-api`, `anthropic-api`, `gemini-api`, plus three OpenAI-compatible backends `openrouter-api`, `venice-api`, `hosted-api` (self-hosted / local). Each implements `stream()` as an async iterator of `{ content, done, usage }` chunks. The service consumes the iterator and emits each chunk as a log line. The OpenAI-compatible chat-completions logic is shared via `OpenAiCompatibleApiAdapter`, which `openai-api` and the three new adapters extend.

`TasksService.create()` (`gateway/src/tasks/tasks.service.ts`) branches on `isApiBackend(backend)` — that split is the single place CLI vs API divergence lives. Adapter implementations are stateless and reused across tasks.

When the user accepts the default model, `TasksService.create()` snapshots `adapterDefaultModel` onto the task row so the transcript shows the actual model, not "—".

### Tasks ↔ Conversations

Conversations (`gateway/src/conversations/`) are a layer over tasks: each user turn creates a new task with `conversationId` set, and the assistant turn is auto-persisted when the task finalizes. Multi-turn history is passed to adapters via `task.messages: ChatMessage[]` — CLI adapters serialize this into a single prompt string; API adapters send it natively as a `messages` array.

`viewMode` (`chat` | `console`) on a conversation row is server-synced so reload preserves the user's chosen render.

### Persistence

SQLite via `better-sqlite3` (`gateway/src/db/database.service.ts`). The DB file lives at `DB_PATH` (default `gateway/data/runner.db`, gitignored). Migrations are an in-process array in `gateway/src/db/migrations.ts`, applied at boot inside a transaction and tracked in `schema_migrations`. **The `gateway/src/migrations/` directory is currently empty and unused** — don't put migrations there.

The DB connection is opened *synchronously in the constructor* (not `onModuleInit`) so peer modules like `TasksService` can query it during their own init. On boot, `TasksService.onModuleInit` marks any task still in `queued`/`running` state as `error` (recovery from gateway crash mid-task).

### Streaming model

Tasks expose a `ReplaySubject<MessageEvent>` per task; the SSE endpoint subscribes. Events: `status`, `log`, `heartbeat` (every `TASK_HEARTBEAT_MS`), `done`. After a task finalizes, late subscribers get a synthesized replay built from the persisted logs.

### Auth & rate limiting

Two auth modes, both honored by the global `JwtAuthGuard`:

- **Session JWT** (`type: 'session'`) from `POST /api/auth/login` (bcrypt-checked against `ADMIN_PASSWORD_HASH`).
- **API token** (`rrt_<id>_<secret>`) from `gateway/src/auth/api-tokens/`. Long-lived, revocable, stored hashed in SQLite.

Per-route throttling uses `PrincipalThrottlerGuard` (keyed on user/token id, not IP) over the base `@nestjs/throttler` config.

### Workspace allowlist

CLI tasks must run inside `DEFAULT_WORKSPACE` or one of `ALLOWED_WORKSPACES` — `resolveAllowedCwd` (`gateway/src/tasks/workspace.validator.ts`) rejects anything outside that set. API tasks skip the check because no subprocess is spawned. When adding new task entry points, route the `cwd` through this validator — do not call `spawn` with an unvalidated path.

### Subprocess env scrubbing

`buildSubprocessEnv` (`gateway/src/tasks/subprocess-env.ts`) starts from a small allowlist (`PATH`, `HOME`, `USER`, `LANG`, proxy vars) and only forwards extras named in `EXTRA_SUBPROCESS_ENV`. The gateway's API keys and JWT secret are not in the allowlist and should stay out — never widen the base list without checking why.

## Hard rules

- **Do not bypass the AuthService setup-script guard.** `AuthService.checkAuthConfiguration()` calls `process.exit(1)` at boot if `gateway/scripts/setup-auth.ts` exists or if `ADMIN_PASSWORD_HASH` is empty. This is intentional — it prevents deploying a public box with a live password-reset utility. If boot fails for this reason, the user removes the script themselves; don't comment out the check or auto-delete.
- **API key env vars belong only in `gateway/.env`.** They are read once at boot via `app.config.ts` and never logged. Don't echo them into task output or commit `.env` files (already gitignored).
- **CORS is closed by default.** `corsOrigins = []` blocks all browser origins. When changing this, update `CORS_ORIGINS` in env rather than hardcoding origins in `main.ts`.

## Config reference

All env vars are validated by `gateway/src/config/env.validation.ts` (Joi) and surfaced as typed config under the `app.*` namespace via `gateway/src/config/app.config.ts`. The README has the full table; the high-signal ones for development are `DEFAULT_BACKEND`, `DEFAULT_WORKSPACE`, `ALLOWED_WORKSPACES`, and the per-backend `*_BIN_PATH` / `*_API_KEY` / `*_DEFAULT_MODEL` triples.

## Further reading

Current / authoritative:

- `README.md` — user-facing setup, troubleshooting per backend.
- `docs/SECURITY.md` — threat model and current mitigations (workspace allowlist is "F-1").
- `docs/AUTHENTICATION.md` — auth bootstrap details.
- `docs/api.md` — programmatic API (tokens, webhooks, signed payloads).
- `ROADMAP.md` — multi-provider roadmap and progress.

Historical design docs — kept for context but **out of date in places**; trust the code first:

- `docs/spec.md`, `docs/plan.md` — original architecture plans. They reference Postgres, Redis, BullMQ, MinIO, OTel, and a Next.js web app — none of which are in the current implementation (SQLite + in-process queue + Vite SPA shipped instead).
- `docs/dashboard-roadmap.md`, `docs/DEVLOG.md`, `docs/SESSION_MANAGEMENT.md`, `docs/SETUP.md` — older snapshots; some details may be stale.
