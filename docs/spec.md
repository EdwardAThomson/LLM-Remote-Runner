
# 🧠 Project Specification: Codex Remote Runner

## 1. Overview

**Codex Remote Runner** is a web and mobile application that connects to a **Codex CLI instance** running on a remote server.

The app allows users to:

* Send **commands or prompts** to the Codex CLI.
* Receive **real-time output** (progress, logs, and results).
* Review **command history** and **artifacts** produced by Codex.

The system architecture consists of:

* **Codex CLI** (installed and authenticated on the server).
* **Gateway API** (server-side controller exposing Codex as a network service).
* **Frontend Clients** (browser and mobile interfaces using a shared SDK).

---

## 2. Objectives

1. Provide a secure, user-friendly interface for interacting with Codex CLI remotely.
2. Stream real-time Codex output to connected clients.
3. Support concurrent sessions and basic authentication.
4. Enable future extensibility (e.g., file management, MCP integrations).

---

## 3. System Architecture

```
+------------------------+        +---------------------------+        +----------------------+
|    Frontend Clients    | <----> |        Gateway API        | <----> |     Codex CLI Tool   |
|  (Web / Mobile / SDK)  |        |     (NestJS app)          |        | (Runs on same host)  |
+------------------------+        +---------------------------+        +----------------------+
           |                                 |                                   |
           |---------> HTTPS (REST/SSE) <----|                                   |
           |                                 |-- spawn("codex exec ...") ------> |
           |                                 |<- capture stdout/stderr ----------|
```

---

## 4. Components

### 4.1 Codex CLI

* Installed globally on the gateway server.
* Authenticated using **headless login** or API key.
* Executed using the `codex exec` command or the **TypeScript SDK**.
* All executions occur within sandboxed working directories.
* Example:

  ```bash
  codex exec --prompt "Refactor src/app.ts" --cwd /srv/project
  ```

---

### 4.2 Gateway API

The gateway exposes a secure REST API to manage Codex executions and stream their outputs.

#### Responsibilities

* Authenticate users.
* Queue and run Codex commands.
* Stream Codex logs/output.
* Maintain task metadata and history.
* Enforce rate limits and sandbox isolation.

#### Technologies

| Layer             | Technology                       | Purpose                                    |
| ----------------- | -------------------------------- | ------------------------------------------ |
| Backend Framework | **NestJS (Node.js)**             | Routing & API structure                    |
| Database          | **PostgreSQL**                   | Persist task metadata & history            |
| Queue             | **Redis + BullMQ** *(optional)*  | Background execution and retry management  |
| Realtime          | **Server-Sent Events (SSE)**     | Stream logs to client                      |
| Storage           | **Local FS / MinIO**             | Store generated artifacts (diffs, patches) |

---

### 4.3 Frontend Clients

Clients connect via the Gateway API to submit tasks and view results.

#### Shared features

* Create a new Codex command.
* View live output (logs, progress).
* Display final status and artifacts.
* View past command history.

#### Technologies

| Platform | Framework               | Notes                       |
| -------- | ----------------------- | --------------------------- |
| Web      | **Next.js (React 18)**  | Installable as a PWA        |
| Mobile   | **React Native (Expo)** | Shares SDK with web         |
| Shared   | **TypeScript SDK**      | Provides REST & SSE helpers |

---

## 5. Data Flow

### Step-by-step

1. **Client → Gateway**:
   `POST /api/tasks`

   * Includes `prompt`, `cwd`, optional environment variables.
   * Returns `task_id`.

2. **Gateway → Codex**:

   * Spawns `codex exec` as a subprocess (or uses SDK).
   * Captures stdout/stderr.

3. **Gateway → Client**:

   * Sends events via SSE (`/api/tasks/:id/stream`):

     * `status`: queued/running/completed/error.
     * `log`: raw output lines.
     * `tokens`: incremental generated text.
     * `done`: final exit code.

4. **Codex completes** → Gateway stores metadata & closes stream.

---

## 6. API Specification

### 6.1 POST `/api/tasks`

Create a new Codex task.

**Request**

```json
{
  "prompt": "Refactor utils/number.ts",
  "cwd": "/srv/repos/project",
  "env": { "NODE_ENV": "test" }
}
```

**Response**

```json
{
  "task_id": "task_abc123",
  "status": "queued"
}
```

---

### 6.2 GET `/api/tasks/:id/stream`

Open a real-time stream of Codex output.

**Response Format (SSE)**

```
event: status
data: {"state":"running"}

event: log
data: {"line":"Planning the refactor..."}

event: tokens
data: {"delta":"Here’s the updated function..."}

event: done
data: {"exit_code":0}
```

**Notes:**
- Logs may initially be line-buffered from Codex stdout/stderr
- Codex may handle internal log persistence; gateway streams ephemeral output
- Completed task logs can optionally be saved to storage

---

### 6.3 GET `/api/tasks`

Retrieve metadata for past tasks.

**Response**

```json
[
  {
    "task_id": "task_abc123",
    "prompt": "Refactor utils/number.ts",
    "created_at": "2025-10-26T19:42:00Z",
    "status": "completed",
    "exit_code": 0
  }
]
```

---

### 6.4 DELETE `/api/tasks/:id`

Cancel a running or queued task.

**Response**

```json
{
  "task_id": "task_abc123",
  "status": "canceled"
}
```

**Notes:**
- Sends SIGTERM to the Codex process, followed by SIGKILL if timeout exceeded
- Codex CLI supports graceful cancellation

---

## 7. Security

* **Authentication:** JWT-based auth (user token per session).
* **Sandboxing:** Codex runs in controlled subdirectories only.
* **Network isolation:** Codex subprocess cannot access external internet (optional).
* **Rate limiting:** Redis-based rate limiter (per user).
* **Logging:** Audit log of all commands and timestamps.

---

## 8. Example Server Code (Node.js)

```ts
import { spawn } from "child_process";
import express from "express";

const app = express();
app.use(express.json());

app.post("/api/tasks", (req, res) => {
  const { prompt, cwd, env } = req.body;
  const id = Date.now().toString();
  tasks[id] = { id, prompt, cwd, env, status: "queued" };
  res.json({ task_id: id });
  runTask(id);
});

app.get("/api/tasks/:id/stream", (req, res) => {
  const task = tasks[req.params.id];
  res.setHeader("Content-Type", "text/event-stream");
  res.flushHeaders();
  const p = spawn("codex", ["exec", "--prompt", task.prompt], { cwd: task.cwd, env });
  const send = (event, data) => res.write(`event: ${event}\ndata:${JSON.stringify(data)}\n\n`);
  send("status", { state: "running" });
  p.stdout.on("data", d => send("log", { line: d.toString() }));
  p.stderr.on("data", d => send("log", { line: d.toString() }));
  p.on("close", code => { send("done", { exit_code: code }); res.end(); });
});
```

---

## 9. Frontend Structure

### 9.1 SDK Example

```ts
export async function createTask(prompt: string) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return res.json();
}

export function streamTask(taskId: string, onMessage: (e: MessageEvent) => void) {
  const es = new EventSource(`/api/tasks/${taskId}/stream`);
  es.onmessage = onMessage;
  return () => es.close();
}
```

### 9.2 UI Components

| Component          | Description                                    |
| ------------------ | ---------------------------------------------- |
| **TaskComposer**   | Input field for Codex prompt and options.      |
| **TaskStreamView** | Displays real-time Codex output (logs/tokens). |
| **TaskHistory**    | Shows past task metadata and status.           |
| **ArtifactViewer** | (Future) Displays generated files or diffs.    |

---

## 10. Deployment

### 10.1 Docker Compose Example

```yaml
version: "3.9"
services:
  gateway:
    build: ./gateway
    ports: ["8080:8080"]
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/codex
      - REDIS_URL=redis://redis:6379
    volumes:
      - /srv/repos:/srv/repos
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
  redis:
    image: redis:7
```

### 10.2 Codex Setup

```bash
npm install -g @openai/codex
codex login --headless
```

---

## 11. Future Extensions

| Feature                       | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| **Multi-user access control** | Per-user workspaces and session sharing.                            |
| **MCP integration**           | Connect Codex to additional MCP servers for file access or testing. |
| **File upload/edit**          | Allow browsing or modifying local repo files.                       |
| **Persistent sessions**       | Keep Codex memory across runs.                                      |
| **Notifications**             | Push alerts when a long task finishes.                              |

---

## 12. Summary

**Codex Remote Runner** converts a local Codex CLI instance into a full remote, multi-user interface with:

* Secure REST/SSE API.
* Real-time log streaming.
* Web & mobile clients.
* Extensible modular design.

This architecture requires **no LLM hosting**, just the Codex CLI + Gateway server.
It can be extended into a lightweight “Codex Cloud Dashboard” or used privately for development teams.
