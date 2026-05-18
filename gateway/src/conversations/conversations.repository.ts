import { Injectable } from '@nestjs/common';
import { AnyBackend } from '../adapters';
import { DatabaseService } from '../db/database.service';
import {
  ConversationDetail,
  ConversationSummary,
  ConversationViewMode,
  MessageRecord,
  MessageRole,
} from './conversation-types';

interface ConversationRow {
  id: string;
  title: string | null;
  system_prompt: string | null;
  view_mode: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  task_id: string | null;
  backend: string | null;
  model: string | null;
  created_at: string;
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly db: DatabaseService) {}

  insertConversation(record: ConversationSummary): void {
    this.db.db
      .prepare(
        `INSERT INTO conversations
           (id, title, system_prompt, view_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.title,
        record.systemPrompt,
        record.viewMode,
        record.createdAt,
        record.updatedAt,
      );
  }

  findConversation(id: string): ConversationSummary | null {
    const row = this.db.db
      .prepare<[string], ConversationRow>(
        'SELECT * FROM conversations WHERE id = ?',
      )
      .get(id);
    return row ? this.rowToSummary(row) : null;
  }

  listConversations(opts: {
    limit: number;
    cursor?: { updatedAt: string; id: string };
  }): ConversationSummary[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.cursor) {
      where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
      params.push(opts.cursor.updatedAt, opts.cursor.updatedAt, opts.cursor.id);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT * FROM conversations ${whereSql}
                 ORDER BY updated_at DESC, id DESC LIMIT ?`;
    params.push(opts.limit);
    return this.db.db
      .prepare<unknown[], ConversationRow>(sql)
      .all(...params)
      .map((row) => this.rowToSummary(row));
  }

  updateConversation(
    id: string,
    patch: {
      title?: string | null;
      systemPrompt?: string | null;
      viewMode?: ConversationViewMode;
    },
    updatedAt: string,
  ): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.title !== undefined) {
      fields.push('title = ?');
      values.push(patch.title);
    }
    if (patch.systemPrompt !== undefined) {
      fields.push('system_prompt = ?');
      values.push(patch.systemPrompt);
    }
    if (patch.viewMode !== undefined) {
      fields.push('view_mode = ?');
      values.push(patch.viewMode);
    }
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(updatedAt, id);
    this.db.db
      .prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  touchUpdatedAt(id: string, updatedAt: string): void {
    this.db.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(updatedAt, id);
  }

  deleteConversation(id: string): void {
    this.db.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  // -- messages ---------------------------------------------------------------

  insertMessage(message: MessageRecord): void {
    this.db.db
      .prepare(
        `INSERT INTO messages
           (id, conversation_id, role, content, task_id, backend, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.taskId,
        message.backend,
        message.model,
        message.createdAt,
      );
  }

  listMessages(conversationId: string): MessageRecord[] {
    return this.db.db
      .prepare<[string], MessageRow>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(conversationId)
      .map((row) => this.rowToMessage(row));
  }

  findDetail(id: string): ConversationDetail | null {
    const summary = this.findConversation(id);
    if (!summary) return null;
    return { ...summary, messages: this.listMessages(id) };
  }

  // -- mapping ----------------------------------------------------------------

  private rowToSummary(row: ConversationRow): ConversationSummary {
    return {
      id: row.id,
      title: row.title,
      systemPrompt: row.system_prompt,
      viewMode: (row.view_mode === 'console' ? 'console' : 'chat') as ConversationViewMode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToMessage(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as MessageRole,
      content: row.content,
      taskId: row.task_id,
      backend: row.backend as AnyBackend | null,
      model: row.model,
      createdAt: row.created_at,
    };
  }
}
