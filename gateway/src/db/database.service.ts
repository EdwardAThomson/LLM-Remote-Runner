import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { migrations } from './migrations';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private database!: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const configuredPath =
      this.configService.get<string>('app.dbPath') ?? './data/runner.db';
    const dbPath = resolve(configuredPath);
    mkdirSync(dirname(dbPath), { recursive: true });

    this.logger.log(`Opening SQLite database at ${dbPath}`);
    this.database = new Database(dbPath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');

    this.runMigrations();
  }

  onModuleDestroy(): void {
    this.database?.close();
  }

  get db(): Database.Database {
    return this.database;
  }

  private runMigrations(): void {
    this.database.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL
      )`,
    );

    const applied = new Set(
      this.database
        .prepare<[], { id: string }>('SELECT id FROM schema_migrations')
        .all()
        .map((row) => row.id),
    );

    const insert = this.database.prepare(
      'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    );

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      this.logger.log(`Applying migration ${migration.id}`);
      const tx = this.database.transaction(() => {
        this.database.exec(migration.sql);
        insert.run(migration.id, new Date().toISOString());
      });
      tx();
    }
  }
}
