# Security Review

This document is a snapshot of the gateway's security posture as of Phase 5. It replaces the older "sensitive files" note that referenced the long-removed `NEXT_PUBLIC_AUTH_TOKEN`.

> ⚠️ This codebase has **not** had a third-party audit. Findings below are based on a self-review of the multi-provider adapter work in Phases 1–4.

---

## Threat model

A successful login gives the holder the ability to:

1. Spawn a configured LLM CLI (`codex`, `claude`, `gemini`) as the gateway's OS user.
2. Choose the working directory the CLI runs in (the request's `cwd` field).
3. Submit arbitrary prompt text, which on Codex with `--full-auto` will be executed without further approval.

So the realistic adversary is **anyone who can obtain the admin password or a live session JWT**. The runner is therefore only as safe as the network boundary and the authentication around it. The threat model is **single-tenant trusted admin** on a localhost/VPN deployment — anything broader needs the mitigations below.

---

## Findings

### F-1 — Arbitrary file-system access via `cwd` (high) — ✅ resolved

**Where:** [gateway/src/tasks/workspace.validator.ts](../gateway/src/tasks/workspace.validator.ts), called from [gateway/src/tasks/tasks.service.ts](../gateway/src/tasks/tasks.service.ts) in `create()`.

Resolved by introducing a closed-by-default workspace allowlist. Every task creation now resolves the requested `cwd` to an absolute path, canonicalizes both the target and the allowlist entries via `fs.realpath`, and rejects with `400 BadRequest` unless the canonical target equals or is a descendant of one of:

- `DEFAULT_WORKSPACE` (always implicitly allowed)
- Any path in `ALLOWED_WORKSPACES` (comma-separated env var, optional)

Symlink escapes are caught because both sides are realpath'd before comparison; `..` traversal is caught because `path.resolve` is applied first. Verified by [gateway/test/tasks/workspace.validator.spec.ts](../gateway/test/tasks/workspace.validator.spec.ts).

API backends do not spawn a subprocess, so `cwd` is informational only for them and bypasses the filesystem check.

### F-2 — Hardcoded `--full-auto` on Codex (high)

**Where:** [gateway/src/adapters/codex.adapter.ts:42](../gateway/src/adapters/codex.adapter.ts#L42)

Codex is invoked with `--full-auto`, which means the model runs shell commands and writes files inside `cwd` without any approval prompt. Combined with F-1, an attacker with a session can read or modify files anywhere reachable.

**Mitigations to consider:** Phase 7 in the roadmap is dedicated to this. Until then, only deploy on hosts where the gateway user has narrow permissions, and prefer the Claude or API backends if the use case allows.

### F-3 — All `process.env` is forwarded to spawned CLIs (medium) — ✅ resolved

**Where:** [gateway/src/tasks/subprocess-env.ts](../gateway/src/tasks/subprocess-env.ts), called from [gateway/src/tasks/tasks.service.ts](../gateway/src/tasks/tasks.service.ts) before each `spawn`.

Resolved by replacing `{ ...process.env, ...invocation.env }` with a curated allowlist. The base allowlist is:

```
PATH, HOME, USER, LOGNAME, LANG, LC_ALL, LC_CTYPE, TERM, TMPDIR, SHELL,
HTTPS_PROXY, HTTP_PROXY, NO_PROXY (and their lowercase variants)
```

Anything else — including `JWT_SECRET`, `ADMIN_PASSWORD_HASH`, and every `*_API_KEY` — is now stripped before the subprocess starts. Adapters can still inject required env via `invocation.env` (winning over the source) for cases where a CLI needs a specific credential. Operators with a custom env var to forward (e.g. corporate proxy helpers, `NODE_OPTIONS`) set the `EXTRA_SUBPROCESS_ENV` comma-separated allowlist.

Verified by [gateway/test/tasks/subprocess-env.spec.ts](../gateway/test/tasks/subprocess-env.spec.ts) and an end-to-end assertion in [gateway/test/tasks.service.spec.ts](../gateway/test/tasks.service.spec.ts).

### F-4 — Prompt content is logged at INFO level (medium, privacy/info-disclosure)

**Where:** [gateway/src/tasks/tasks.service.ts:225-227](../gateway/src/tasks/tasks.service.ts#L225-L227)

The startup log line includes the first 100 chars of `invocation.args`, which contains the prompt. If logs are shipped to a central aggregator, every user prompt — potentially containing secrets, PII, or proprietary code — ends up there. CLI stdout is also forwarded as `log` events and persisted in the in-memory `task.logs` array.

**Mitigations to consider:** drop or hash the prompt in the start log; gate any prompt logging behind `LOG_LEVEL=debug`.

### F-5 — JWT has no revocation path (medium)

**Where:** [gateway/src/auth/auth.service.ts:98-100](../gateway/src/auth/auth.service.ts#L98-L100)

Sessions are 24-hour JWTs with no allowlist or denylist. If a token leaks (browser extension, shell history, screen share), the only remediation is rotating `JWT_SECRET`, which invalidates every active session.

**Mitigations to consider:** keep a small in-memory or Redis set of revoked `jti` claims, or shorten the lifetime and add a refresh-token flow.

### F-6 — CORS allows any origin (low/medium, deployment-dependent)

**Where:** [gateway/src/main.ts:12-15](../gateway/src/main.ts#L12-L15)

`origin: true, credentials: true` reflects the request origin. Fine for localhost dev; for any deployment where the gateway is reachable from a browser running attacker-controlled JS, this would let a third-party site invoke `/api/tasks` once a victim has logged in.

**Mitigations to consider:** read an `ALLOWED_ORIGINS` env var and pass a list rather than `true`. README already calls this out as a production action item.

### F-7 — Rate limiting is global, not per-user, and SSE is exempt (low)

**Where:** [gateway/src/config/env.validation.ts:40-41](../gateway/src/config/env.validation.ts#L40-L41), [gateway/src/tasks/tasks.controller.ts:50-51](../gateway/src/tasks/tasks.controller.ts#L50-L51)

`@SkipThrottle()` on the stream endpoint is appropriate (long-lived connection), but combined with in-memory task storage (F-8) and unbounded prompt length, it leaves room for resource exhaustion from a single session.

**Mitigations to consider:** cap the number of concurrent SSE connections per session; cap prompt size at the DTO level.

### F-8 — In-memory task storage with no cap (low)

**Where:** [gateway/src/tasks/tasks.service.ts:66](../gateway/src/tasks/tasks.service.ts#L66)

`this.tasks = new Map<string, TaskRecord>()` grows for the lifetime of the process. Each record holds the prompt and the full log array. Many small tasks → unbounded memory.

**Mitigations to consider:** evict completed tasks after N hours, or bound the map size and drop the oldest.

### F-9 — `JWT_SECRET` minimum is only 16 chars (low)

**Where:** [gateway/src/config/env.validation.ts:36](../gateway/src/config/env.validation.ts#L36)

`Joi.string().min(16).required()` allows any 16-character string. The README correctly recommends `openssl rand -base64 32`, but the validator wouldn't reject a weaker hand-typed secret.

**Mitigations to consider:** raise the minimum to 32 chars, or validate base64/hex shape.

### F-10 — Claude adapter's `parseOutput` is never called (low, UX bug masquerading as security)

**Where:** [gateway/src/adapters/claude-cli.adapter.ts:58](../gateway/src/adapters/claude-cli.adapter.ts#L58), [gateway/src/tasks/tasks.service.ts:251-257](../gateway/src/tasks/tasks.service.ts#L251-L257)

The streaming path appends raw stdout lines as they arrive; `parseOutput` (which unwraps Claude's `{"result": "..."}` envelope) is never invoked. Users currently see the JSON envelope instead of the model's text. Not a security bug, but worth fixing alongside any output-handling change.

---

## What's already done well

- **No shell interpolation.** All CLI invocations go through `spawn(command, args)` with an array of args ([tasks.service.ts:231](../gateway/src/tasks/tasks.service.ts#L231)). Prompts containing backticks or `;` are passed verbatim to the binary, not the shell. Verified by [test/adapters/codex.adapter.spec.ts](../gateway/test/adapters/codex.adapter.spec.ts).
- **Bcrypt for password storage** ([auth.service.ts:79](../gateway/src/auth/auth.service.ts#L79)), no plaintext password handling.
- **Setup-script kill switch** ([auth.service.ts:47-64](../gateway/src/auth/auth.service.ts#L47-L64)): gateway refuses to start if `gateway/scripts/setup-auth.ts` still exists, preventing trivial password resets on a running deployment.
- **DTO validation** ([create-task.dto.ts](../gateway/src/tasks/dto/create-task.dto.ts)): `backend` is validated against a fixed allowlist; `forbidNonWhitelisted: true` in `main.ts` rejects unknown body fields.
- **API keys are read once at boot** from env, never round-tripped through requests. They reach adapter constructors but don't appear in DTOs or task records.

---

## Suggested follow-up work

In priority order for a hardening pass before deploying anywhere shared:

1. ~~Workspace allowlist + path canonicalization (F-1)~~ — done.
2. Make `--full-auto` opt-in (Phase 7 of [ROADMAP.md](../ROADMAP.md)) (F-2).
3. ~~Curated subprocess env (F-3)~~ — done.
4. Restrict CORS origins via env var (F-6).
5. Drop prompt content from INFO-level logs (F-4).
6. Bound in-memory task storage and add per-session SSE cap (F-7, F-8).
7. Token revocation list (F-5).

---

## Reporting a vulnerability

If you find something that warrants private disclosure, please open a security advisory on the GitHub repo rather than a public issue.
