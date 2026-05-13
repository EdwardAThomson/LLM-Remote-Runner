# LLM Remote Runner - Multi-Provider Roadmap

> Evolving from Codex-only to a universal LLM CLI runner supporting multiple backends.

## Overview

Transform the existing Codex Remote Runner into a flexible, multi-provider LLM execution platform that supports:
- **Codex CLI** (OpenAI GPT-5)
- **Claude Code CLI** (Anthropic Claude)
- **Gemini CLI** (Google Gemini)
- **API backends** (OpenAI, Anthropic, Google APIs directly)

---

## Phase 1: Gateway Backend Abstraction

### 1.1 Core Infrastructure
- [x] Create `CliAdapter` interface in `gateway/src/adapters/cli-adapter.interface.ts`
- [x] Define common types: `CliBackend`, `CliConfig`, `CliInvocation`
- [x] Create base adapter class with shared subprocess logic

### 1.2 CLI Adapters
- [x] Implement `CodexAdapter` (refactor existing logic)
- [x] Implement `ClaudeCliAdapter` (with JSON output parsing)
- [x] Implement `GeminiCliAdapter` (with model flag support)
- [x] Create `AdapterFactory` to instantiate adapters by backend name

### 1.3 Configuration
- [x] Add new env vars: `CLAUDE_BIN_PATH`, `GEMINI_BIN_PATH`
- [x] Update `app.config.ts` with multi-provider settings
- [x] Update `env.validation.ts` schema (optional vars for each CLI)
- [x] Add default model configuration per backend

### 1.4 Task Service Updates
- [x] Add `backend` field to `CreateTaskDto`
- [x] Update `TasksService.runTask()` to use adapter factory
- [x] Store backend info in `TaskRecord` for display
- [x] Handle backend-specific output parsing (e.g., Claude JSON)

---

## Phase 2: SDK Updates

### 2.1 Type Definitions
- [x] Add `backend` field to `CreateTaskPayload`
- [x] Add `CliBackend` type export
- [x] Update `TaskSummary` to include `backend` field

### 2.2 API Functions
- [x] Update `createTask()` to accept backend parameter
- [x] No changes needed for `streamTask()` / `cancelTask()` (backend-agnostic)

---

## Phase 3: Web UI Updates

### 3.1 Task Form
- [x] Add backend selector dropdown to `TaskConsole.tsx`
- [x] Show available backends (could query gateway for installed CLIs)
- [x] Persist last-used backend in localStorage

### 3.2 Display Enhancements
- [x] Show backend name in task output header
- [x] Add backend-specific icons/colors
- [x] Update status messages per backend

### 3.3 Configuration Page (Optional)
- [ ] Add settings page for default backend selection
- [ ] Show CLI availability status

---

## Phase 4: API Backends (Optional Extension)

### 4.1 API Adapter Infrastructure
- [x] Create `ApiAdapter` interface (different from CLI)
- [x] Implement `OpenAiApiAdapter`
- [x] Implement `AnthropicApiAdapter`
- [x] Implement `GeminiApiAdapter`

### 4.2 Configuration
- [x] Add API key env vars (with secure handling)
- [x] Model selection per API provider

### 4.3 Streaming Considerations
- [x] API responses need different streaming approach
- [x] SSE translation layer for API streaming integrated into TasksService

---

## Phase 5: Polish & Documentation

### 5.1 Documentation
- [x] Update README.md with multi-provider setup
- [x] Document each backend's requirements
- [x] Add troubleshooting for each CLI

### 5.2 Testing
- [x] Unit tests for each CLI adapter (`buildCommand`, Claude `parseOutput`)
- [x] Adapter factory tests
- [x] Integration test for `TasksService` task creation across CLI backends
- [ ] Per-provider API adapter unit tests (deferred — requires SDK mocking)
- [ ] E2E test for web UI backend selection (deferred — no Playwright/Cypress infra)

### 5.3 Security Review
- [x] Audit new env vars handling — written up in [docs/SECURITY.md](docs/SECURITY.md)
- [x] Review subprocess spawning for each CLI — no shell interpolation; F-1 / F-3 flagged
- [x] Credential leakage check — F-3 (env forwarding) and F-4 (prompt logging) flagged for follow-up

---

## Implementation Notes

### CLI Invocation Patterns

```bash
# Codex
codex exec --full-auto --skip-git-repo-check -C <cwd> "<prompt>"

# Claude Code
claude -p "<prompt>" --output-format json
# Returns: {"result": "..."}

# Gemini CLI
gemini -p "<prompt>" -m <model>
```

### Backend Detection

Each CLI can be checked for availability:
```typescript
// Check if binary exists in PATH
import { which } from 'which'; // or use child_process.execSync('which ...')
```

### Suggested File Structure

```
gateway/src/
├── adapters/
│   ├── cli-adapter.interface.ts
│   ├── base-cli.adapter.ts
│   ├── codex.adapter.ts
│   ├── claude-cli.adapter.ts
│   ├── gemini-cli.adapter.ts
│   └── adapter.factory.ts
├── tasks/
│   ├── dto/
│   │   └── create-task.dto.ts  # Add backend field
│   ├── tasks.service.ts        # Use adapter factory
│   └── ...
└── config/
    └── app.config.ts           # Multi-provider config
```

---

## Phase 6: Session Continuity (Multi-Turn Conversations)

Today every submission is a fresh, non-interactive invocation — each CLI is spawned headless (e.g. `codex exec --full-auto`, `claude -p ... --output-format json`, `gemini -p ...`) with no memory of prior turns. This phase adds opt-in conversation resumption so a task can build on the previous one.

### 6.1 CLI Capability Mapping
- [ ] Codex CLI: investigate `codex exec resume` / session-id support and document the exact flag set
- [ ] Claude Code CLI: support `--resume <session-id>` and `--continue` (most-recent session)
- [ ] Gemini CLI: confirm whether resume is supported; otherwise fall back to manual context replay
- [ ] Document per-backend behavior (which adapters truly resume vs. which simulate via prompt prefix)

### 6.2 Gateway / Adapter Changes
- [ ] Extend `CliCommandOptions` with `resumeSessionId?: string` and `continueLast?: boolean`
- [ ] Each `CliAdapter.buildCommand()` translates those flags into the backend-specific args
- [ ] Capture and persist the session id emitted by each CLI on task completion (where available)
- [ ] Store `sessionId` and `parentTaskId` on `TaskRecord` so the UI can chain tasks

### 6.3 SDK & API
- [ ] Add `resumeSessionId` / `continueLast` to `CreateTaskPayload`
- [ ] Expose `sessionId` on `TaskSummary`
- [ ] Endpoint or query param to list resumable sessions per backend

### 6.4 Web UI
- [ ] "Continue last task" button on `TaskConsole`
- [ ] Show session id badge on completed tasks; allow "resume this session" action
- [ ] Persist last session id per backend in localStorage (alongside last-used backend)

### 6.5 API Backend Parity
- [ ] For API adapters (OpenAI/Anthropic/Gemini), implement equivalent continuity by replaying prior turns from a stored transcript — gated behind the same flag so the UI behaves consistently across CLI and API backends

---

## Phase 7: Approval Mode Controls (`--full-auto` as Opt-In)

Codex is currently invoked with `--full-auto`, which bypasses all approval prompts and lets the model run shell commands and edit files unattended in the task's `cwd`. That's powerful but risky given the gateway runs whatever the authenticated user submits. This phase makes the approval mode an explicit, user-visible choice with safer defaults.

### 7.1 Adapter Changes
- [ ] Introduce an `approvalMode` option on `CliCommandOptions`:
  - `read-only` — no writes / no shell (where the CLI supports it)
  - `suggest` — propose changes, require confirmation (default for new users)
  - `full-auto` — current behavior, no approval prompts
- [ ] `CodexAdapter` maps modes to the right flag set (`--full-auto` only when explicitly chosen)
- [ ] `ClaudeCliAdapter` maps to Claude Code's `--permission-mode` (`plan` / `default` / `acceptEdits` / `bypassPermissions`) and surfaces equivalent semantics
- [ ] Document the mapping table per backend in `docs/SECURITY.md`

### 7.2 Configuration & Defaults
- [ ] New env var `DEFAULT_APPROVAL_MODE` (default: `suggest`, not `full-auto`)
- [ ] Optional `ALLOW_FULL_AUTO=false` kill switch so operators can disable the dangerous mode entirely
- [ ] Audit-log entry whenever a task is run in `full-auto`

### 7.3 SDK & API
- [ ] Add `approvalMode` to `CreateTaskPayload` and `TaskSummary`
- [ ] Gateway rejects requests for modes disabled by config

### 7.4 Web UI
- [ ] Approval-mode selector in `TaskConsole`, defaulting to the configured default
- [ ] Inline warning banner when `full-auto` is selected explaining the risk (arbitrary shell / file writes in the chosen `cwd`)
- [ ] Visual badge on completed tasks showing the mode used, so history is auditable

### 7.5 Documentation
- [ ] Update README security section to describe approval modes and recommend `suggest` for shared deployments
- [ ] Cross-reference from `docs/AUTHENTICATION.md` and `docs/SECURITY.md`

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Gateway Backend | ✅ Complete | All tasks done |
| Phase 2: SDK Updates | ✅ Complete | All tasks done |
| Phase 3: Web UI | ✅ Complete | Core features done |
| Phase 4: API Backends | ✅ Complete | OpenAI, Anthropic, Gemini APIs |
| Phase 5: Polish | 🟢 Mostly Complete | Docs, CLI adapter unit tests, and security review done; API adapter unit tests + web E2E deferred |
| Phase 6: Session Continuity | 🔲 Not Started | `--resume` / `--continue` across backends |
| Phase 7: Approval Modes | 🔲 Not Started | Make `--full-auto` opt-in with warnings |

---

## Next Steps

Phases 1-5 are largely complete. Remaining work:

**Phase 5: Remaining Polish** (deferred)
1. Per-provider API adapter unit tests (`OpenAiApiAdapter`, `AnthropicApiAdapter`, `GeminiApiAdapter`) — needs SDK mocking
2. E2E test for web UI backend selection — needs Playwright/Cypress setup
3. Address the findings in [docs/SECURITY.md](docs/SECURITY.md), especially F-1 (`cwd` allowlist) and F-3 (subprocess env curation)

**Phase 6: Session Continuity**
1. Map each CLI's resume capability and pick a uniform option surface
2. Thread `resumeSessionId` / `continueLast` through adapters → service → SDK → UI
3. Persist session ids on tasks so the UI can offer "continue last"

**Phase 7: Approval Mode Controls**
1. Replace the hardcoded `--full-auto` with a per-task `approvalMode` (default `suggest`)
2. Add `DEFAULT_APPROVAL_MODE` and `ALLOW_FULL_AUTO` env vars
3. Surface mode in the UI with a warning banner for `full-auto`
