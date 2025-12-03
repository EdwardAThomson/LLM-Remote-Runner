# Project Setup Guide

This document outlines the minimum steps to boot Codex Remote Runner locally. Expand each section as additional features land.

## Prerequisites

- Node.js 20 (ships with Corepack for pnpm).
- pnpm 8 (`corepack enable pnpm`).
- Docker (for the compose stack).
- Codex CLI installed and authenticated on the host running the gateway.

## Install Dependencies

```bash
pnpm install --recursive
```

## Service Env Files

Create `gateway/.env` with the following defaults, adjusting credentials per environment:

```
PORT=3000
REDIS_URL=redis://localhost:6379
CODEX_BIN_PATH=codex
JWT_SECRET=replace-with-a-strong-secret
JWT_ISSUER=codex-remote-runner
RATE_LIMIT_POINTS=60
RATE_LIMIT_DURATION=60
TASK_HEARTBEAT_MS=15000
```

Set `CODEX_BIN_PATH` to the absolute path of your Codex CLI binary. If the binary is missing, task executions will fail immediately and emit an error status on the stream.

Tokens are validated with the shared secret using the standard Bearer scheme. Web clients send the token in the `Authorization` header, while SSE connections append `?token=...` (the SDK handles this automatically). Rotate `JWT_SECRET` regularly in real deployments.

`TASK_HEARTBEAT_MS` controls how frequently the gateway emits SSE heartbeat events (defaults to 15 seconds). Lower the value when running behind aggressive proxies that close idle connections.

For the web client set `NEXT_PUBLIC_GATEWAY_URL` if the gateway runs on a different origin. For mobile use `EXPO_PUBLIC_GATEWAY_URL`.

## Running Locally

1. Start infrastructure:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
2. Install dependencies and launch the gateway:
   ```bash
   pnpm install --recursive
   pnpm --filter @codex/gateway dev
   ```
3. In separate terminals run the web and mobile clients:
   ```bash
   cd web && pnpm dev
   cd mobile && pnpm start
   ```

## Testing

Gateway unit tests mock the Codex subprocess and run against in-memory repositories:

```bash
pnpm --filter @codex/gateway test
```

The stream endpoint now emits `heartbeat` events in addition to `status`, `log`, and `done`. Clients can ignore heartbeats or surface the timestamp to users.

To cancel a running task, POST to `/api/tasks/:id/cancel` (optionally with `{ "reason": "..." }`). A successful cancellation yields a `status` update to `canceled` and a `done` event with the same state.

## Next Steps

- Replace the in-memory task registry with Postgres persistence.
- Integrate Codex subprocess spawning and SSE streaming.
- Wire authentication and rate limiting once the auth module is ready.

Track additional tasks via `plan.md` and `spec.md`.
