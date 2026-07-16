# API Integration Guide

This guide is for **services and scripts** calling the gateway over HTTP — not for browser users of the web app. If you just want to run tasks from the dashboard, you don't need this.

The interactive reference for every endpoint, with request/response schemas and a "try it" button, lives at:

- **Swagger UI**: `http://<gateway>/api/docs`
- **OpenAPI JSON**: `http://<gateway>/api/docs/json`

Both are gated by the admin password. This guide covers the workflow around the schema reference: minting credentials, the auth model, webhooks, and the rate-limit rules.

## TL;DR

```bash
# 1. Mint a token in the web app: /settings/tokens → "Create token"
# 2. Save the plaintext (shown once)
TOKEN="rrt_..."

# 3. Run a task; ask the gateway to POST when it's done
curl -X POST "$GATEWAY/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "summarize the latest commit log",
    "backend": "claude-cli",
    "webhookUrl": "https://my-app.example.com/runner-webhooks",
    "webhookSecret": "shared-hmac-secret"
  }'
```

## Authentication

There are two credential types. Use the one that fits your caller:

| Type | Format | Lifetime | Where it comes from | Best for |
| --- | --- | --- | --- | --- |
| **JWT** | opaque, ~200 chars | 24 hours | `POST /api/auth/login` with the admin password | The web app's own session. Not recommended for scripts. |
| **API token** | `rrt_<id>_<secret>` | until revoked | `/settings/tokens` in the web app, or `POST /api/tokens` (JWT-only) | Cron jobs, CI, integrations, bots — anything non-interactive. |

Both are presented as `Authorization: Bearer <value>`. The gateway's global auth guard accepts either.

### Minting an API token

Open `/settings/tokens` in the web app, give the token a descriptive name (e.g. `nightly-batch` or `slack-bot`), and copy the plaintext value **once** — it isn't shown again. The dashboard records the last-used timestamp so you can spot which tokens are still active.

Equivalent HTTP call, if you'd rather script it (note: minting tokens requires a JWT, not another API token):

```bash
JWT=$(curl -s "$GATEWAY/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"password":"...your-admin-password..."}' \
  | jq -r .access_token)

curl -X POST "$GATEWAY/api/tokens" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"name":"nightly-batch"}'
# → { "token": "rrt_<id>_<secret>", "summary": { ... } }
```

### Revocation

`DELETE /api/tokens/:id` (JWT-only). The token immediately stops working — there's no grace period and no soft-delete. The row stays in the DB with `revoked_at` set so you can see what was used when.

## Creating tasks

```http
POST /api/tasks
Authorization: Bearer <jwt or rrt_...>
Content-Type: application/json
```

```json
{
  "prompt": "Required. The user prompt for the LLM.",
  "backend": "codex | claude-cli | gemini-cli | openai-api | anthropic-api | gemini-api | openrouter-api | venice-api | hosted-api",
  "model": "optional, e.g. gemini-3-pro-preview",
  "cwd": "optional, must be inside the configured workspace allowlist (CLI backends only)",
  "systemPrompt": "optional, API backends only",
  "webhookUrl": "optional, https URL POSTed when the task finalizes",
  "webhookSecret": "optional, used to HMAC-sign the webhook body"
}
```

Response:

```json
{
  "task_id": "abc123...",
  "task": { "id": "...", "state": "queued", ... }
}
```

The task runs asynchronously. To see its progress, either:

- **Stream live** via `GET /api/tasks/:id/stream` (Server-Sent Events) — the responsive option.
- **Poll** via `GET /api/tasks/:id` — fine if you just want the final result.
- **Subscribe** by setting `webhookUrl` on the create call — best for fire-and-forget.

## Webhooks

If you set `webhookUrl` (and optionally `webhookSecret`) on the create call, the gateway POSTs the task's final state to that URL as soon as the task finalizes (state becomes `completed`, `error`, or `canceled`).

**Payload:**

```json
{
  "task_id": "abc123...",
  "state": "completed",
  "exit_code": 0,
  "error_message": null
}
```

**Headers:**

- `Content-Type: application/json`
- `User-Agent: llm-remote-runner/1.0`
- `X-Runner-Signature: sha256=<hex>` (only if you supplied `webhookSecret`)

**Signature verification** (Node example):

```js
import { createHmac } from 'crypto';

const expected = 'sha256=' +
  createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
  return res.status(400).send('bad signature');
}
```

**Retries:** 4 attempts total (1 initial + 3 retries at 1s/5s/30s backoff), 10s timeout per attempt. The last HTTP status (or `0` for a network error) is recorded on the task row but isn't currently exposed via the API. If you need an SLA, treat receipt of the webhook as best-effort and confirm the state via `GET /api/tasks/:id` if you haven't seen one after a minute.

## Rate limits

Each principal (JWT user or API token) gets its own bucket of **60 requests per 60 seconds** by default. The defaults live in `RATE_LIMIT_POINTS` and `RATE_LIMIT_DURATION` env vars; bump them if your service polls aggressively.

Exemption: the SSE stream endpoint (`GET /api/tasks/:id/stream`) is *not* counted, so an open stream doesn't burn through the budget.

When you hit the limit you get **HTTP 429 Too Many Requests**.

## Errors

Standard Nest error envelope:

```json
{
  "statusCode": 400,
  "message": "backend must be one of: codex, claude-cli, ...",
  "error": "Bad Request"
}
```

| Status | When you see it |
| --- | --- |
| `400` | Bad payload (DTO validation failure) |
| `401` | Missing/invalid/revoked token; expired JWT |
| `404` | Task or token id doesn't exist |
| `429` | Rate limit hit |
| `5xx` | Gateway-side problem; logs in the gateway process |

## CORS (browser-based callers)

If you're calling the gateway from a browser app on a different origin, add your origin to `CORS_ORIGINS` (comma-separated) in the gateway's `.env`. The default is empty — no cross-origin allowed.

## TypeScript SDK

The repo ships an SDK at [`sdk/`](../sdk) that wraps the HTTP calls (`createTask`, `streamTask`, `getTask`, `listTasks`, `deleteTask`, `cancelTask`). It's a workspace package; if you're working inside the monorepo, import it as `@codex/sdk`. It is not published to npm.

## See also

- `/api/docs` — interactive endpoint reference (this guide complements it; doesn't replace it)
- [`dashboard-roadmap.md`](dashboard-roadmap.md) — phase-by-phase plan and design decisions
- [`AUTHENTICATION.md`](AUTHENTICATION.md) — how the admin password is stored and the JWT scheme
- [`SECURITY.md`](SECURITY.md) — workspace allowlists, subprocess env, hardening notes
