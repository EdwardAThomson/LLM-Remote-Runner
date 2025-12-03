# Gateway Service

NestJS service acting as the Codex Remote Runner gateway. The API spawns Codex CLI processes, streams their output over SSE (with heartbeat events), and retains task history in memory for the duration of the process.

## Scripts

- `pnpm dev` – run the server with hot reload via `ts-node-dev`.
- `pnpm build` – compile TypeScript to `dist/`.
- `pnpm start` – execute the compiled output.
- `pnpm test` – run Jest unit tests (uses mocked Codex process and in-memory repositories).

Environment variables are validated through `src/config/env.validation.ts`. Provide `CODEX_BIN_PATH` pointing to the Codex CLI binary; otherwise the gateway will mark tasks as errored when it attempts to spawn the process.

## API Snapshot

- `POST /api/tasks` – spawn a Codex execution. Response payload includes `{ task_id, task }`.
- `GET /api/tasks` – list task summaries (state, timestamps, exit code).
- `GET /api/tasks/:id` – fetch task details with accumulated logs.
- `GET /api/tasks/:id/stream` – server-sent events emitting `status`, `log`, and `done` messages.
- `POST /api/tasks/:id/cancel` – request termination of an active task (optional JSON body `{ reason }`).

## Authentication & Rate Limiting

- All endpoints require a JWT Bearer token; SSE connections send the token via the `token` query string for compatibility with `EventSource`.
- Tokens are verified with the shared secret configured through `JWT_SECRET` and are expected to include a `sub` claim identifying the user.
- `@nestjs/throttler` enforces a global rate limit (`RATE_LIMIT_POINTS` per `RATE_LIMIT_DURATION` seconds) with tighter per-route throttling on task creation. Adjust these knobs before exposing the gateway publicly.
- SSE emits periodic `heartbeat` events (`TASK_HEARTBEAT_MS`, default 15s) to keep connections alive; clients may optionally surface the timestamp but can ignore the event type if not needed.
