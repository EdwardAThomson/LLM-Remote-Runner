import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';

export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiTokenRow {
  id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

@Injectable()
export class ApiTokensRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  insert(record: Omit<ApiTokenRecord, 'lastUsedAt' | 'revokedAt'>): void {
    this.databaseService.db
      .prepare(
        `INSERT INTO api_tokens (id, name, token_hash, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(record.id, record.name, record.tokenHash, record.createdAt);
  }

  findById(id: string): ApiTokenRecord | null {
    const row = this.databaseService.db
      .prepare<[string], ApiTokenRow>('SELECT * FROM api_tokens WHERE id = ?')
      .get(id);
    return row ? this.rowToRecord(row) : null;
  }

  listAll(): ApiTokenRecord[] {
    return this.databaseService.db
      .prepare<[], ApiTokenRow>(
        'SELECT * FROM api_tokens ORDER BY created_at DESC',
      )
      .all()
      .map((row) => this.rowToRecord(row));
  }

  revoke(id: string, revokedAt: string): void {
    this.databaseService.db
      .prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?')
      .run(revokedAt, id);
  }

  touchLastUsed(id: string, ts: string): void {
    this.databaseService.db
      .prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
      .run(ts, id);
  }

  private rowToRecord(row: ApiTokenRow): ApiTokenRecord {
    return {
      id: row.id,
      name: row.name,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
  }
}
