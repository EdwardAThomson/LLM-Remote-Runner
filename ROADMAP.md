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
- [ ] Update README.md with multi-provider setup
- [ ] Document each backend's requirements
- [ ] Add troubleshooting for each CLI

### 5.2 Testing
- [ ] Unit tests for each adapter
- [ ] Integration tests for task creation per backend
- [ ] E2E test for web UI backend selection

### 5.3 Security Review
- [ ] Audit new env vars handling
- [ ] Review subprocess spawning for each CLI
- [ ] Ensure no credential leakage in logs

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

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Gateway Backend | ✅ Complete | All tasks done |
| Phase 2: SDK Updates | ✅ Complete | All tasks done |
| Phase 3: Web UI | ✅ Complete | Core features done |
| Phase 4: API Backends | ✅ Complete | OpenAI, Anthropic, Gemini APIs |
| Phase 5: Polish | 🔲 Not Started | |

---

## Next Steps

Phases 1-4 are complete. The remaining work is in **Phase 5: Polish & Documentation**:

1. Update README.md with multi-provider setup instructions
2. Add unit/integration tests for adapters
3. Security audit of environment variable handling
