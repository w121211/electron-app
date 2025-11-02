// src/core/database/sqlite-client-v2.ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { Kysely, SqliteDialect, type ColumnType } from "kysely";
import { Logger, type ILogObj } from "tslog";

const logger = new Logger<ILogObj>({ name: "SqliteClientV2" });

export interface PromptsTable {
  id: ColumnType<string, string, never>;
  slug: ColumnType<string | null, string | null, string | null>;
  content: ColumnType<string, string, string>;
  metadata: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<string, string, string>;
  updated_at: ColumnType<string, string, string>;
}

export type ModelSurfaceV2 = "api" | "terminal" | "web" | "pty";

export interface ChatSessionsTableV2 {
  id: ColumnType<string, string, never>;
  modelSurface: ColumnType<ModelSurfaceV2, ModelSurfaceV2, ModelSurfaceV2>;
  sessionStatus: ColumnType<string, string, string>;
  metadata: ColumnType<string | null, string | null, string | null>;
  sourcePromptId: ColumnType<string | null, string | null, string | null>;
  createdAt: ColumnType<string, string, string>;
  updatedAt: ColumnType<string, string, string>;
}

export interface ChatMessagesTableV2 {
  id: ColumnType<string, string, never>;
  chatSessionId: ColumnType<string, string, string>;
  messageIndex: ColumnType<number, number, number>;
  payload: ColumnType<string, string, string>;
  metadata: ColumnType<string, string, string>;
}

export interface AppDatabaseV2 {
  prompts: PromptsTable;
  chat_sessions: ChatSessionsTableV2;
  chat_messages: ChatMessagesTableV2;
}

interface ManagedConnection {
  db: Kysely<AppDatabaseV2>;
  sqlite: BetterSqlite3Database;
}

const connections = new Map<string, ManagedConnection>();

function ensureDirectoryExists(filePath: string): void {
  const directory = path.dirname(filePath);
  if (fs.existsSync(directory)) {
    return;
  }

  logger.info(`Creating database directory: ${directory}`);
  fs.mkdirSync(directory, { recursive: true });
}

function ensureSchema(sqlite: BetterSqlite3Database): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      modelSurface TEXT NOT NULL,
      sessionStatus TEXT NOT NULL,
      metadata TEXT,
      sourcePromptId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (sourcePromptId) REFERENCES prompts(id) ON DELETE SET NULL
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
}

export function openAppDatabaseV2(
  databaseFilePath: string,
): Kysely<AppDatabaseV2> {
  const cached = connections.get(databaseFilePath);
  if (cached) {
    logger.debug(`Using cached database connection: ${databaseFilePath}`);
    return cached.db;
  }

  logger.info(`Opening database (v2 schema): ${databaseFilePath}`);
  ensureDirectoryExists(databaseFilePath);

  const sqlite = new Database(databaseFilePath);
  sqlite.pragma("foreign_keys = ON");

  ensureSchema(sqlite);

  const db = new Kysely<AppDatabaseV2>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  connections.set(databaseFilePath, { db, sqlite });
  logger.info(`Database opened successfully: ${databaseFilePath}`);

  return db;
}

export function closeAppDatabaseV2(databaseFilePath: string): void {
  const managed = connections.get(databaseFilePath);
  if (!managed) {
    logger.debug(`Database already closed or not found: ${databaseFilePath}`);
    return;
  }

  logger.info(`Closing database (v2 schema): ${databaseFilePath}`);
  managed.db.destroy();
  managed.sqlite.close();
  connections.delete(databaseFilePath);
  logger.info(`Database closed successfully: ${databaseFilePath}`);
}
