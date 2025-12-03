# Dev Log

## 2024-05-16
- Prototyped Postgres persistence via TypeORM, then reverted to an in-memory task store to keep the MVP dependency-free; persistence remains on the roadmap.
- Tightened configuration handling, documented JWT/heartbeat settings, and ensured the gateway can operate without a database.
- Updated SDK/client status handling to surface error messages; refreshed docs to note Postgres + Codex CLI prerequisites.
- Introduced JWT auth scaffolding plus global/per-route rate limiting; SSE tokens are accepted via query params for compatibility with EventSource.
- Added Jest-based unit test harness for `TasksService`, mocking Codex subprocess execution and verifying status/log streaming.
- Implemented task cancellation (`POST /api/tasks/:id/cancel`), heartbeat SSE events governed by `TASK_HEARTBEAT_MS`, SDK cancel helper, and web console UI for cancel/heartbeat monitoring.
