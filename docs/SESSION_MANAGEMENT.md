# Codex Session Management

## Current Limitation

The current implementation spawns a **new Codex process per task**, which means:
- ❌ Each task starts with **no context** from previous tasks
- ❌ Context is **lost** when the task completes
- ❌ Cannot resume previous conversations

## Codex Session Capabilities

Codex CLI supports persistent sessions:

### Starting a Session
```bash
codex exec --prompt "Create a hello world app" -C /path/to/workspace
```

When the session ends, Codex outputs:
```
To continue this session, run codex resume 019a2a9a-9d73-7053-9df8-b1ddb7d6d58f
```

### Resuming a Session
```bash
# Resume specific session
codex exec resume 019a2a9a-9d73-7053-9df8-b1ddb7d6d58f "Add error handling"

# Resume most recent session
codex exec resume --last "Add error handling"

# Interactive resume (shows picker)
codex resume
```

## Proposed Architecture Changes

To support persistent sessions, the gateway needs:

### 1. Session Management Service
```typescript
interface CodexSession {
  id: string;                    // UUID from Codex
  workspaceId: string;           // User-defined workspace
  userId: string;
  status: 'active' | 'idle' | 'terminated';
  lastActivityAt: string;
  createdAt: string;
}
```

### 2. Modified Task Execution
Instead of:
```typescript
spawn('codex', ['exec', '--prompt', prompt])
```

Use:
```typescript
// First task in workspace
spawn('codex', ['exec', '--prompt', prompt, '-C', workspace])

// Subsequent tasks
spawn('codex', ['exec', 'resume', sessionId, prompt])
```

### 3. Session Lifecycle
- **Create**: First task in a workspace starts a new session
- **Resume**: Subsequent tasks resume the session
- **Idle timeout**: Auto-terminate sessions after N minutes of inactivity
- **Manual termination**: User can explicitly end a session

### 4. API Changes

#### New Endpoints
```
POST /api/sessions
  - Create a new session for a workspace
  - Returns: { session_id, workspace_id }

GET /api/sessions
  - List user's active sessions

POST /api/sessions/:id/terminate
  - Explicitly end a session

GET /api/sessions/:id/tasks
  - View task history for a session
```

#### Modified Task Creation
```json
POST /api/tasks
{
  "prompt": "Add error handling",
  "workspace_id": "my-project",
  "session_id": "019a2a9a-9d73-7053-9df8-b1ddb7d6d58f"  // optional
}
```

If `session_id` is provided, resume that session. Otherwise, create new or resume most recent for the workspace.

## Implementation Strategy

### Phase 1: Capture Session IDs
- Parse Codex output for session IDs
- Store session metadata in database
- Display session ID to users

### Phase 2: Manual Resume
- Add UI to select/resume sessions
- Implement `codex exec resume` spawning

### Phase 3: Automatic Resume
- Auto-resume most recent session per workspace
- Implement idle timeout and cleanup

### Phase 4: Advanced Features
- Session branching (fork a session)
- Session export/import
- Multi-user session sharing

## Parsing Codex Output

To extract session IDs, monitor stdout for:
```
To continue this session, run codex resume <UUID>
```

Regex: `codex resume ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`

## Workspace Management

Since Codex sandboxes to directories, the app should:

1. **Allow workspace creation** from the UI
   ```
   POST /api/workspaces
   { "name": "my-project", "path": "/home/user/codex-workspace/my-project" }
   ```

2. **List available workspaces**
   ```
   GET /api/workspaces
   ```

3. **Validate paths** against allow-list
   ```typescript
   const ALLOWED_ROOTS = ['/home/edward/codex-workspace'];
   if (!ALLOWED_ROOTS.some(root => path.startsWith(root))) {
     throw new Error('Invalid workspace path');
   }
   ```

## Next Steps

1. ✅ Document current limitation
2. ⏳ Add session ID parsing to task service
3. ⏳ Implement workspace management
4. ⏳ Add resume capability
5. ⏳ Build session UI in web client
