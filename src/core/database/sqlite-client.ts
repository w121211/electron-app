// src/core/database/sqlite-client.ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { Kysely, SqliteDialect, type ColumnType } from "kysely";
import { Logger, type ILogObj } from "tslog";

const logger = new Logger<ILogObj>({ name: "SqliteClient" });

export type ModelSurface = "api" | "terminal" | "web" | "pty";

export interface ChatSessionsTable {
  id: ColumnType<string, string, never>;
  modelSurface: ColumnType<ModelSurface, ModelSurface, ModelSurface>;
  sessionStatus: ColumnType<string, string, string>;
  metadata: ColumnType<string | null, string | null, string | null>;
  scriptPath: ColumnType<string | null, string | null, string | null>;
  scriptModifiedAt: ColumnType<string | null, string | null, string | null>;
  scriptHash: ColumnType<string | null, string | null, string | null>;
  scriptSnapshot: ColumnType<string | null, string | null, string | null>;
  createdAt: ColumnType<string, string, string>;
  updatedAt: ColumnType<string, string, string>;
}

export interface ChatMessagesTable {
  id: ColumnType<string, string, never>;
  chatSessionId: ColumnType<string, string, string>;
  messageIndex: ColumnType<number, number, number>;
  payload: ColumnType<string, string, string>;
  metadata: ColumnType<string, string, string>;
}

export interface PromptDraftsTable {
  id: ColumnType<string, string, never>;
  prompt_script_path: ColumnType<string | null, string | null, string | null>;
  content_draft: ColumnType<string | null, string | null, string | null>;
  updated_at: ColumnType<string, string, string>;
}

export interface AppDatabase {
  chat_sessions: ChatSessionsTable;
  chat_messages: ChatMessagesTable;
  prompt_drafts: PromptDraftsTable;
}

interface ManagedConnection {
  db: Kysely<AppDatabase>;
  sqlite: BetterSqlite3Database;
}

const connections = new Map<string, ManagedConnection>();

function createDirectoryFor(filePath: string): void {
  const directory = path.dirname(filePath);
  if (fs.existsSync(directory)) {
    return;
  }

  logger.info(`Creating database directory: ${directory}`);
  fs.mkdirSync(directory, { recursive: true });
}

function ensureSchema(sqlite: BetterSqlite3Database): void {
  const tableInfo = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_sessions'",
    )
    .get() as { name: string } | undefined;

  if (tableInfo) {
    const columns = sqlite
      .prepare("PRAGMA table_info('chat_sessions')")
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));

    const requiresMigration =
      columnNames.has("filePath") ||
      columnNames.has("fileStatus") ||
      columnNames.has("toolSet") ||
      columnNames.has("sessionType");

    if (requiresMigration) {
      logger.warn("Legacy schema detected, dropping old tables for migration");
      sqlite.exec("DROP TABLE IF EXISTS chat_messages;");
      sqlite.exec("DROP TABLE IF EXISTS chat_sessions;");
    }
  }

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      modelSurface TEXT NOT NULL,
      sessionStatus TEXT NOT NULL,
      metadata TEXT,
      scriptPath TEXT,
      scriptModifiedAt TEXT,
      scriptHash TEXT,
      scriptSnapshot TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
  );

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chatSessionId TEXT NOT NULL,
      messageIndex INTEGER NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT NOT NULL,
      FOREIGN KEY (chatSessionId) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )`,
  );

  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_session_index
      ON chat_messages (chatSessionId, messageIndex)`,
  );

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS prompt_drafts (
      id TEXT PRIMARY KEY,
      prompt_script_path TEXT,
      content_draft TEXT,
      updated_at TEXT NOT NULL
    )`,
  );
}

export function openAppDatabase(databaseFilePath: string): Kysely<AppDatabase> {
  const cached = connections.get(databaseFilePath);
  if (cached) {
    logger.debug(`Using cached database connection: ${databaseFilePath}`);
    return cached.db;
  }

  logger.info(`Opening database: ${databaseFilePath}`);
  createDirectoryFor(databaseFilePath);

  const sqlite = new Database(databaseFilePath);
  sqlite.pragma("foreign_keys = ON");

  ensureSchema(sqlite);

  const db = new Kysely<AppDatabase>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  connections.set(databaseFilePath, { db, sqlite });
  logger.info(`Database opened successfully: ${databaseFilePath}`);

  return db;
}

export function closeAppDatabase(databaseFilePath: string): void {
  const managed = connections.get(databaseFilePath);
  if (!managed) {
    logger.debug(`Database already closed or not found: ${databaseFilePath}`);
    return;
  }

  logger.info(`Closing database: ${databaseFilePath}`);
  managed.db.destroy();
  managed.sqlite.close();
  connections.delete(databaseFilePath);
  logger.info(`Database closed successfully: ${databaseFilePath}`);
}
