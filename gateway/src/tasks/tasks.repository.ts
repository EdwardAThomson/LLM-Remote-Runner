import { Injectable } from '@nestjs/common';
import { AnyBackend } from '../adapters';
import { DatabaseService } from '../db/database.service';
import { TaskDetail, TaskLogEvent, TaskState, TaskSummary } from './task-types';

interface TaskRow {
  id: string;
  prompt: string;
  backend: string;
  model: string | null;
  cwd: string | null;
  state: string;
  exit_code: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskWebhookRow {
  webhook_url: string | null;
  webhook_secret: string | null;
}

export interface TaskWebhookConfig {
  url: string;
  secret: string | null;
}

interface TaskLogRow {
  ts: string;
  stream: string;
  line: string;
}

@Injectable()
export class TasksRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  insert(task: TaskSummary, webhook?: TaskWebhookConfig | null): void {
    this.databaseService.db
      .prepare(
        `INSERT INTO tasks
           (id, prompt, backend, model, cwd, state, exit_code, error_message,
            created_at, updated_at, webhook_url, webhook_secret)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.prompt,
        task.backend,
        task.model ?? null,
        task.cwd ?? null,
        task.state,
        task.exitCode,
        task.errorMessage,
        task.createdAt,
        task.updatedAt,
        webhook?.url ?? null,
        webhook?.secret ?? null,
      );
  }

  findWebhook(id: string): TaskWebhookConfig | null {
    const row = this.databaseService.db
      .prepare<[string], TaskWebhookRow>(
        'SELECT webhook_url, webhook_secret FROM tasks WHERE id = ?',
      )
      .get(id);
    if (!row || !row.webhook_url) return null;
    return { url: row.webhook_url, secret: row.webhook_secret };
  }

  updateWebhookStatus(id: string, status: number, attemptedAt: string): void {
    this.databaseService.db
      .prepare(
        `UPDATE tasks
           SET webhook_last_status = ?, webhook_last_attempt_at = ?
         WHERE id = ?`,
      )
      .run(status, attemptedAt, id);
  }

  updateState(
    id: string,
    state: TaskState,
    errorMessage: string | null,
    updatedAt: string,
    exitCode: number | null,
  ): void {
    this.databaseService.db
      .prepare(
        `UPDATE tasks
           SET state = ?, error_message = ?, updated_at = ?, exit_code = ?
         WHERE id = ?`,
      )
      .run(state, errorMessage, updatedAt, exitCode, id);
  }

  appendLog(taskId: string, event: TaskLogEvent): void {
    this.databaseService.db
      .prepare(
        `INSERT INTO task_logs (task_id, ts, stream, line) VALUES (?, ?, ?, ?)`,
      )
      .run(taskId, event.ts, event.stream, event.line);
  }

  findSummary(id: string): TaskSummary | null {
    const row = this.databaseService.db
      .prepare<[string], TaskRow>('SELECT * FROM tasks WHERE id = ?')
      .get(id);
    return row ? this.rowToSummary(row) : null;
  }

  findDetail(id: string): TaskDetail | null {
    const summary = this.findSummary(id);
    if (!summary) return null;
    const logs = this.databaseService.db
      .prepare<[string], TaskLogRow>(
        'SELECT ts, stream, line FROM task_logs WHERE task_id = ? ORDER BY id ASC',
      )
      .all(id)
      .map((row) => ({
        ts: row.ts,
        stream: row.stream as 'stdout' | 'stderr',
        line: row.line,
      }));
    return { ...summary, logs };
  }

  listSummaries(opts: {
    limit: number;
    cursor?: { createdAt: string; id: string };
    backend?: string;
    state?: string;
  }): TaskSummary[] {
    const where: string[] = [];
    const params: unknown[] = [];

    if (opts.cursor) {
      where.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(opts.cursor.createdAt, opts.cursor.createdAt, opts.cursor.id);
    }
    if (opts.backend) {
      where.push('backend = ?');
      params.push(opts.backend);
    }
    if (opts.state) {
      where.push('state = ?');
      params.push(opts.state);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT * FROM tasks ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(opts.limit);

    return this.databaseService.db
      .prepare<unknown[], TaskRow>(sql)
      .all(...params)
      .map((row) => this.rowToSummary(row));
  }

  deleteTask(id: string): void {
    this.databaseService.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  /**
   * Mark any tasks that were left running/queued from a prior process as errors.
   * Returns affected ids so the caller can log them.
   */
  markInterruptedAsError(now: string): string[] {
    const db = this.databaseService.db;
    const rows = db
      .prepare<[], { id: string }>(
        "SELECT id FROM tasks WHERE state IN ('queued', 'running')",
      )
      .all();
    if (rows.length === 0) return [];
    db.prepare(
      `UPDATE tasks
         SET state = 'error',
             error_message = 'Interrupted by gateway restart',
             updated_at = ?
       WHERE state IN ('queued', 'running')`,
    ).run(now);
    return rows.map((row) => row.id);
  }

  private rowToSummary(row: TaskRow): TaskSummary {
    return {
      id: row.id,
      prompt: row.prompt,
      backend: row.backend as AnyBackend,
      model: row.model,
      cwd: row.cwd,
      state: row.state as TaskState,
      exitCode: row.exit_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
