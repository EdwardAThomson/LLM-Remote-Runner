# Running Codex Remote Runner

Detailed steps to launch the gateway and web console so you can submit Codex tasks from the browser.

## 1. Prerequisites

- **Node.js 20** (ships with Corepack; run `corepack enable pnpm`).
- **pnpm 8** (`corepack prepare pnpm@8 --activate`).
- **Codex CLI** installed (`npm i -g @openai/codex`) and logged in via `codex login --headless`.
- (Optional) **Docker** if you plan to start the sample infra stack in `infra/`.

> **Note:** A database is not required in the current MVP. Task history exists in memory until the gateway process exits.

## 2. Clone & Install

```bash
# inside your workspace
pnpm install --recursive
```

This installs dependencies for the gateway, SDK, web, and mobile packages.

## 3. Configure Environment

Create `gateway/.env` with values similar to:

```
PORT=3000
CODEX_BIN_PATH=codex
JWT_SECRET=replace-with-a-strong-secret
JWT_ISSUER=codex-remote-runner
RATE_LIMIT_POINTS=60
RATE_LIMIT_DURATION=60
TASK_HEARTBEAT_MS=15000
```

- `CODEX_BIN_PATH` should point to the Codex CLI binary (absolute path recommended).
- The web app expects a JWT for API calls. For quick testing you can hard-code a token signed with `JWT_SECRET` and include it in requests (see “Authentication” below).

For the web client set `NEXT_PUBLIC_GATEWAY_URL` in `web/.env.local` if the gateway runs on a non-default host or port:

```
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_TOKEN=<your test JWT>
```

## 4. Start the Gateway

```bash
pnpm --filter @codex/gateway dev
```

This launches NestJS on `PORT` (default `3000`). The gateway spawns a fresh Codex process per task, streams logs over SSE, emits heartbeats every `TASK_HEARTBEAT_MS`, and keeps task history in memory.

## 5. Start the Web Console

In a new terminal:

```bash
pnpm --filter @codex/web dev
```

Next.js will serve the UI on `http://localhost:3000` (or 3001 if the port is occupied). When prompted for auth, the web app sends the token from `NEXT_PUBLIC_AUTH_TOKEN` as a Bearer header and as a `token` query param for SSE compatibility.

### Manual API Testing

You can also issue requests with `curl` using a JWT signed with `JWT_SECRET` (HS256). Example:

```bash
TOKEN=<your signed JWT>
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"List files"}'
```

Stream output:

```bash
curl -N "http://localhost:3000/api/tasks/<task_id>/stream?token=$TOKEN"
```

Cancel a running task:

```bash
curl -X POST "http://localhost:3000/api/tasks/<task_id>/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Stopping the run"}'
```

## 6. Optional: Mobile Client

The Expo app scaffold lives in `mobile/`. To try it, supply an EventSource polyfill (e.g., `react-native-sse`) and run:

```bash
pnpm --filter @codex/mobile start
```

Since SSE isn’t polyfilled by default, streaming will show placeholder messages until you wire in a compatible implementation.

## 7. Testing & Verification

- `pnpm --filter @codex/gateway test` – Jest suite mocking Codex to ensure status/log/heartbeat/cancel flows.
- `pnpm --filter @codex/gateway build` – TypeScript build of the gateway.
- `pnpm --filter @codex/web build` – Verify the Next.js build.

## 8. Troubleshooting

| Issue | Fix |
| --- | --- |
| `codex: command not found` | Update `CODEX_BIN_PATH` to the absolute location or ensure the binary is on `PATH` for the gateway process. |
| Gateway rejects requests with 401 | Ensure the JWT is signed with `JWT_SECRET` and includes a `sub` claim. |
| Web console shows “Stream error” | Check the gateway logs; confirm SSE URL includes `token` query param and that the gateway is reachable at `NEXT_PUBLIC_GATEWAY_URL`. |
| Heartbeats stop updating | The task likely completed or the gateway restarted. Relaunch the gateway or resubmit the task. |

## 9. Next Steps / Roadmap

- Reintroduce persistent storage (Postgres) once the MVP flow is validated.
- Expand JWT handling to fetch tokens dynamically rather than hard-coding them.
- Bring the mobile client to feature parity once an EventSource polyfill is in place.

Happy testing! If anything fails unexpectedly, run `pnpm --filter @codex/gateway test` and inspect the gateway logs for diagnostics.
