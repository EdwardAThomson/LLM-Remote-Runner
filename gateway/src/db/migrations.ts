export interface Migration {
  id: string;
  sql: string;
}

const m001_initial: Migration = {
  id: '001_initial',
  sql: `
    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      prompt          TEXT NOT NULL,
      backend         TEXT NOT NULL,
      model           TEXT,
      cwd             TEXT,
      state           TEXT NOT NULL,
      exit_code       INTEGER,
      error_message   TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      conversation_id TEXT,
      parent_task_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS task_logs (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      ts       TEXT NOT NULL,
      stream   TEXT NOT NULL,
      line     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id, id);
  `,
};

export const migrations: Migration[] = [m001_initial];
