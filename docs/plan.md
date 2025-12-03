
# Implementation Plan: **Codex Remote Runner**

## 0) Goals & Non-Goals

**Goals**

* Run the **Codex CLI** on a server and expose it safely via a Gateway API.
* Submit tasks (prompts/commands), **stream progress in real time** (SSE/WS), store history.
* Ship **Web (Next.js)** and **Mobile (React Native/Expo)** clients with a shared TypeScript SDK.
* Support multiple concurrent users, rate limits, and audit logging.

**Non-Goals (initial release)**

* Multi-tenant billing, orgs/teams.
* Rich file manager or full IDE.
* Long-running background agents (beyond one task per request).

---

## 1) Architecture at a Glance

```
[ Web (Next.js) ]     [ Mobile (Expo) ]
        \              /
         \            /
         [@yourorg/codex-sdk (TS)]
                   |
             [Gateway API]
         (NestJS + SSE + Redis + Postgres)
             |           \
             |            \----[Object Store (MinIO/S3)]
             |
        [Codex CLI subprocess]
          (spawned per task; headless login)

**Note:** BullMQ queue is optional for MVP; start with immediate spawn.
Tasks can be queued later for better load management and retry logic.
```

---

## 2) High-Level Milestones

1. **Foundation**: repo scaffolding, Dockerized infra, health checks.
2. **Codex Execution & Streaming**: spawn `codex exec`, stream stdout/stderr → SSE.
3. **Persistence & Auth**: JWT auth, Postgres task metadata, Redis rate limiting.
4. **Web Client MVP**: create task, live stream, task history UI.
5. **Mobile Client MVP**: same flows in Expo (reusing SDK).
6. **Hardening & Ops**: sandboxing, observability, CI/CD, backups, secrets.

*(Use “Milestone 1..6” in your tracker; avoid date promises until scoping is stable.)*

---

## 3) Deliverables (Definition of Done)

* **Gateway service** with:

  * `POST /api/tasks` (spawn Codex)
  * `GET /api/tasks/:id/stream` (SSE)
  * `GET /api/tasks` (list tasks)
  * JWT auth, per-user rate limit, structured logs.
* **SDK (`@yourorg/codex-sdk`)**:

  * `createTask(prompt, options)`
  * `streamTask(taskId, handlers)`
  * Auth token injection, backoff/retry.
* **Web app**:

  * Task composer, live stream view, history list, basic settings.
* **Mobile app**:

  * Same flows; offline-safe UI for history (reads server state on reconnect).
* **Ops**:

  * Docker Compose for dev; IaC for prod; log/metric dashboards; backup scripts.
* **Docs**:

  * README, env setup, runbooks, security notes, incident checklist.

---

## 4) Repository & Folder Structure

```
codex-remote-runner/
├─ gateway/                 # NestJS service
│  ├─ src/
│  │  ├─ app.module.ts
│  │  ├─ config/            # env schema, config service
│  │  ├─ auth/              # JWT guard, strategies
│  │  ├─ tasks/             # controller, service, SSE, spawn logic
│  │  ├─ queue/             # BullMQ (optional), processors
│  │  ├─ db/                # Prisma or TypeORM entities/migrations
│  │  └─ observability/     # OTel, pino, interceptors
│  ├─ Dockerfile
│  └─ package.json
├─ sdk/                     # @yourorg/codex-sdk
│  ├─ src/index.ts
│  ├─ tsconfig.json
│  └─ package.json
├─ web/                     # Next.js (App Router)
│  ├─ app/(routes)/
│  ├─ components/
│  ├─ lib/sdk.ts
│  └─ package.json
├─ mobile/                  # React Native (Expo)
│  ├─ app/
│  ├─ components/
│  ├─ lib/sdk.ts
│  └─ package.json
├─ infra/
│  ├─ docker-compose.yml    # gateway + postgres + redis + minio
│  ├─ nginx/                # reverse proxy config (TLS)
│  └─ terraform/            # optional IaC for prod
├─ .github/workflows/
│  ├─ ci.yml                # build, test, lint
│  └─ deploy.yml            # container build & rollout
└─ README.md
```

---

## 5) Detailed Work Plan (Tickets)

### 5.1 Foundation

* **T-001**: Initialize monorepo (pnpm or npm workspaces). Add Prettier/ESLint, commit hooks.
* **T-002**: Add `infra/docker-compose.yml` with Postgres, Redis, MinIO, Gateway.
* **T-003**: Gateway bootstrap (NestJS), health endpoint `/healthz`, pino logger.

### 5.2 Codex Execution & Streaming

* **T-010**: Codex runner service:

  * Spawn `codex exec --prompt <text> --cwd <path>`, capture stdout/stderr.
  * Normalize output to line-buffered events.
* **T-011**: SSE stream endpoint:

  * `GET /api/tasks/:id/stream`
  * Emit events: `status`, `log`, `done`.
  * Ensure heartbeat to keep proxies happy (send a comment every 15–20s).
* **T-012**: Cancellation:

  * `DELETE /api/tasks/:id` → SIGTERM → SIGKILL (timeout).
  * Emit `status: "canceled"`.

### 5.3 Persistence & Auth

* **T-020**: DB schema (Prisma/TypeORM):

  * `users(id, email, created_at)`
  * `tasks(id, user_id, prompt, cwd, status, exit_code, created_at, finished_at)`
  * `task_logs(task_id, seq, ts, type, payload)` *(optional; can start file-based)*
* **T-021**: JWT auth + guard, `/auth/login` (password or OAuth later).
* **T-022**: Rate limiting (Redis key: `user:${id}:rpm`).
* **T-023**: Task CRUD:

  * `POST /api/tasks` → create & spawn immediately (BullMQ queue is optional/future enhancement).
  * `GET /api/tasks` → paginate per user.
  * `GET /api/tasks/:id` → metadata.
  * `DELETE /api/tasks/:id` → cancel running task (SIGTERM → SIGKILL).

### 5.4 SDK

* **T-030**: `createTask(prompt, options?: {cwd, env})`.
* **T-031**: `streamTask(taskId, { onStatus, onLog, onDone, onError })` using SSE.
* **T-032**: Token injection, baseURL configuration, exponential backoff.

### 5.5 Web App (Next.js)

* **T-040**: Auth UI (username/password or magic link placeholder).
* **T-041**: **TaskComposer** (prompt + advanced options).
* **T-042**: **TaskStreamView** (terminal-like view; auto-scroll; pause/resume; copy).
* **T-043**: **TaskHistory** (infinite scroll; clickable rows → detail page).
* **T-044**: Settings panel (cwd defaults; theme; streaming buffer size).
* **T-045**: PWA manifest, basic offline shell (history list renders server state when online).

### 5.6 Mobile App (Expo)

* **T-050**: Auth screen, token storage (SecureStore/Keychain).
* **T-051**: Composer screen, Stream screen (native EventSource polyfill or WS fallback).
* **T-052**: History list/detail, pull-to-refresh.
* **T-053**: Deep linking for `codex://task/<id>` (optional).

### 5.7 Hardening & Ops

* **T-060**: **Headless Codex login** on server (document steps; store token securely).
* **T-061**: Sandboxing:

  * Runner uses allow-listed `cwd` roots only.
  * Optional: run tasks in a Docker sidecar with mounted repo.
* **T-062**: Observability:

  * OTel traces; Prometheus metrics (task counts, durations, spawn failures).
  * Log correlation IDs per task.
* **T-063**: CI/CD:

  * Build gateway & clients; run tests; lint; typecheck.
  * Push containers; deploy to staging.
* **T-064**: Backups: Postgres (daily), MinIO (weekly), rotation strategy.
* **T-065**: Secrets: use `.env` for dev, Vault/SSM for prod; rotate quarterly.

---

## 6) Interfaces (Final Form)

### Gateway API

* `POST /api/tasks`

  * Body: `{ prompt: string, cwd?: string, env?: Record<string,string> }`
  * Resp: `{ task_id: string, status: "queued" | "running" }`
* `GET /api/tasks/:id/stream` (SSE)

  * `event: status | log | done`
* `GET /api/tasks?offset&limit`
* `GET /api/tasks/:id`
* `DELETE /api/tasks/:id` (cancel)

### SSE Event Shapes

```json
// status
{ "state": "queued" | "running" | "canceled" | "completed" | "error", "ts": "ISO" }
// log
{ "line": "string", "ts": "ISO", "stream": "stdout" | "stderr" }
// done
{ "exit_code": 0 }
```

**Notes:**
- Line-buffered logs for MVP perhaps, then token-level streaming later.
- Codex CLI handles internal state; gateway streams output ephemerally

---

## 7) Security Checklist

* [ ] JWT required on all `/api/*` endpoints (except `/healthz`).
* [ ] CORS restricted to your domains.
* [ ] Per-user RPM limit (e.g., 60/min) + burst protection.
* [ ] `cwd` must match allow-list prefixes (e.g., `/srv/repos/*`).
* [ ] Runner strips dangerous env vars; explicit env allow-list.
* [ ] Kill runaway processes on timeout; clean up children (process group).
* [ ] No direct exposure of Codex or shell to the public network.
* [ ] Audit log per task (who ran what, when, from where).

---

## 8) Testing Strategy

**Gateway**

* Unit: task service (spawn mocks), SSE emitter.
* Integration: spawn a **fake runner** binary (simulates Codex) to validate streaming + cancellation deterministically.
* E2E: local Compose stack + real `codex exec` against a tiny sample repo.

**Web/Mobile**

* Component tests for Composer/Stream (log rendering, auto-scroll).
* SDK tests: SSE reconnection, backoff, error surfaces.

**Load/Resilience**

* Simulate 50 concurrent tasks (with fake runner).
* Chaos tests: kill Codex mid-run, simulate stderr bursts, network resets.

---

## 9) Dev & Prod Environments

**Dev** (Docker Compose)

* Services: `gateway`, `postgres`, `redis`, `minio`, `nginx`.
* Bind-mount a local repo under `/srv/repos`.

**Prod**

* NGINX (TLS, gzip, SSE buffering), Gateway behind it.
* Systemd or container orchestrator (K8s/Nomad).
* Separate worker pod if queues are used.
* Centralized logs (Loki/ELK), metrics (Prometheus/Grafana), alerts.

---

## 10) Runbooks (Ops)

**Deploy**

1. Build containers, run migrations.
2. `codex login --headless` on the host (document token path).
3. Reload gateway; verify `/healthz`.

**Incident: Task won’t end**

* GET task → state `running` over timeout.
* Send cancel → kill process group.
* Check logs for orphaned children; restart worker.

**Incident: Streams stall**

* Verify NGINX `proxy_buffering off` for SSE location.
* Ensure heartbeat comments every 15s.
* Check client reconnection policy.

---

## 11) Backlog / Near-Term Enhancements

* Tool “profiles” per repo (pre-prompt, cwd presets).
* File diff/artifact capture (Codex output → parse → save patch files in MinIO; show in UI).
* Webhooks or email/push notifications upon completion.
* WebSocket fallback (handy on RN; keep SSE as primary).
* Session pinning (reuse prior context when Codex supports it).
* MCP integrations surfaced in UI.

---

## 12) Acceptance Criteria (MVP)

* A user can log in, submit a prompt, watch **live output** appear line-by-line, and see a **completed** status with exit code.
* Concurrent tasks from two users do not interfere.
* If the gateway restarts mid-stream, the task continues and the user can reconnect and resume viewing output.
* All tasks are persisted; `/api/tasks` lists them with correct statuses.

---

## 13) Quick Start (Developer)

```bash
# 1) Infra up
docker compose -f infra/docker-compose.yml up -d

# 2) Gateway env
cp gateway/.env.example gateway/.env   # set DB/REDIS/MINIO creds

# 3) Install & run gateway
cd gateway && pnpm i && pnpm dev

# 4) Codex on the host VM (once)
npm i -g @openai/codex
codex login --headless   # follow instructions

# 5) Web client
cd ../web && pnpm i && pnpm dev

# 6) Mobile (Expo)
cd ../mobile && pnpm i && pnpm start
```

