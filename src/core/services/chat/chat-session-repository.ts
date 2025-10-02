// src/core/services/chat/chat-session-repository.ts
import path from "node:path";
import { Kysely, type Insertable, type Selectable } from "kysely";
import { z } from "zod";
import {
  modelMessageSchema,
  type ModelMessage,
  type ToolSet,
  type TypedToolCall,
} from "ai";
import type { ToolCallConfirmation } from "../tool-call/tool-call-confirmation.js";
import type { ToolAlwaysAllowRule } from "../tool-call/tool-call-runner.js";
import {
  openAppDatabase,
  type AppDatabase,
} from "../../database/sqlite-client.js";

export type ChatSessionType =
  | "chat_engine"
  | "chat_draft"
  | "external_chat"
  | "pty_chat";

export type ChatMode = "chat" | "agent";

export type ChatSessionStatus =
  | "idle"
  | "processing"
  | "scheduled"
  | "waiting_confirmation"
  | "max_turns_reached"
  | "external_active"
  | "external_terminated";

export interface ChatMessageMetadata {
  timestamp: Date;
  subtaskId?: string;
  taskId?: string;
  fileReferences?: {
    path: string;
    md5: string;
  }[];
}

export interface ChatMessage {
  id: string;
  message: ModelMessage;
  metadata: ChatMessageMetadata;
}

export interface ExternalChatMetadata {
  mode?: "terminal" | "pty";
  pid?: number;
  workingDirectory?: string;
  pty?: {
    initialCommand?: string;
    ptyInstanceId?: string;
    snapshot?: string;
    snapshotHtml?: string;
  };
}

export interface ChatMetadata {
  title?: string;
  tags?: string[];
  mode?: ChatMode;
  knowledge?: string[];
  promptDraft?: string;
  external?: ExternalChatMetadata;
  modelId?: `${string}/${string}`;
  currentTurn?: number;
  maxTurns?: number;
  toolSet?: ToolSet;
  toolCallsAwaitingConfirmation?: Array<TypedToolCall<ToolSet>>;
  toolCallConfirmations?: Array<ToolCallConfirmation>;
  toolAlwaysAllowRules?: Array<ToolAlwaysAllowRule>;
}

export interface ChatSessionData {
  id: string;
  sessionType: ChatSessionType;
  sessionStatus: ChatSessionStatus;
  messages: ChatMessage[];
  metadata?: ChatMetadata;
  scriptPath?: string | null;
  scriptModifiedAt?: Date | null;
  scriptHash?: string | null;
  scriptSnapshot?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExternalChatMetadataSchema: z.ZodType<ExternalChatMetadata> = z.object({
  mode: z.enum(["terminal", "pty"]).optional(),
  pid: z.number().optional(),
  workingDirectory: z.string().optional(),
  pty: z
    .object({
      initialCommand: z.string().optional(),
      ptyInstanceId: z.string().optional(),
      snapshot: z.string().optional(),
      snapshotHtml: z.string().optional(),
    })
    .optional(),
});

const ModelIdSchema = z
  .string()
  .regex(/^.+\/.+$/)
  .transform((value) => value as `${string}/${string}`);

const ChatMetadataSchema: z.ZodType<ChatMetadata> = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
  external: ExternalChatMetadataSchema.optional(),
  modelId: ModelIdSchema.optional(),
  currentTurn: z.number().optional(),
  maxTurns: z.number().optional(),
  toolSet: z.any().optional(),
  toolCallsAwaitingConfirmation: z.array(z.any()).optional(),
  toolCallConfirmations: z
    .array(
      z.object({
        toolCallId: z.string(),
        outcome: z.enum(["yes", "yes_always", "no"]),
        timestamp: z.coerce.date(),
      }),
    )
    .optional(),
  toolAlwaysAllowRules: z
    .array(
      z.object({
        toolName: z.string(),
        sourceConfirmation: z.object({
          toolCallId: z.string(),
          outcome: z.enum(["yes", "yes_always", "no"]),
          timestamp: z.coerce.date(),
        }),
      }),
    )
    .optional(),
});

const ChatMessageMetadataSchema: z.ZodType<ChatMessageMetadata> = z.object({
  timestamp: z.coerce.date(),
  subtaskId: z.string().optional(),
  taskId: z.string().optional(),
  fileReferences: z
    .array(
      z.object({
        path: z.string(),
        md5: z.string(),
      }),
    )
    .optional(),
});

const ChatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: z.string(),
  message: modelMessageSchema,
  metadata: ChatMessageMetadataSchema,
});

const ChatSessionDataSchema: z.ZodType<ChatSessionData> = z.object({
  id: z.string(),
  sessionType: z.enum([
    "chat_engine",
    "chat_draft",
    "external_chat",
    "pty_chat",
  ]),
  sessionStatus: z.enum([
    "idle",
    "processing",
    "scheduled",
    "waiting_confirmation",
    "max_turns_reached",
    "external_active",
    "external_terminated",
  ]),
  messages: z.array(ChatMessageSchema),
  metadata: ChatMetadataSchema.optional(),
  scriptPath: z.string().nullable().optional(),
  scriptModifiedAt: z.coerce.date().nullable().optional(),
  scriptHash: z.string().nullable().optional(),
  scriptSnapshot: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export interface ChatSessionRepository {
  create(session: ChatSessionData): Promise<void>;
  update(session: ChatSessionData): Promise<void>;
  delete(sessionId: string): Promise<void>;
  getById(sessionId: string): Promise<ChatSessionData | null>;
  list(): Promise<ChatSessionData[]>;
  findByScriptPath(scriptPath: string): Promise<ChatSessionData | null>;
  findByScriptHash(scriptHash: string): Promise<ChatSessionData[]>;
}

type ChatSessionRow = Selectable<AppDatabase["chat_sessions"]>;
type NewChatSessionRow = Insertable<AppDatabase["chat_sessions"]>;

type ChatMessageRow = Selectable<AppDatabase["chat_messages"]>;
type NewChatMessageRow = Insertable<AppDatabase["chat_messages"]>;

interface ChatSessionRepositoryOptions {
  databaseFilePath: string;
}

export class ChatSessionRepositoryImpl implements ChatSessionRepository {
  private readonly db: Kysely<AppDatabase>;

  constructor(options: ChatSessionRepositoryOptions) {
    this.db = openAppDatabase(options.databaseFilePath);
  }

  async create(session: ChatSessionData): Promise<void> {
    const sessionRow = this.serializeSession(session);

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("chat_sessions")
        .values(sessionRow)
        .executeTakeFirst();

      if (session.messages.length === 0) {
        return;
      }

      const messageRows = this.serializeMessages(session.id, session.messages);
      await trx.insertInto("chat_messages").values(messageRows).execute();
    });
  }

  async update(session: ChatSessionData): Promise<void> {
    const sessionRow = this.serializeSession(session);

    await this.db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable("chat_sessions")
        .set({
          sessionType: sessionRow.sessionType,
          sessionStatus: sessionRow.sessionStatus,
          metadata: sessionRow.metadata,
          scriptPath: sessionRow.scriptPath,
          scriptModifiedAt: sessionRow.scriptModifiedAt,
          scriptHash: sessionRow.scriptHash,
          scriptSnapshot: sessionRow.scriptSnapshot,
          updatedAt: sessionRow.updatedAt,
        })
        .where("id", "=", session.id)
        .executeTakeFirst();

      if (result.numUpdatedRows === 0n) {
        throw new Error(
          `Chat session ${session.id} does not exist in database`,
        );
      }

      await trx
        .deleteFrom("chat_messages")
        .where("chatSessionId", "=", session.id)
        .execute();

      if (session.messages.length === 0) {
        return;
      }

      const messageRows = this.serializeMessages(session.id, session.messages);
      await trx.insertInto("chat_messages").values(messageRows).execute();
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("chat_messages")
        .where("chatSessionId", "=", sessionId)
        .execute();

      await trx
        .deleteFrom("chat_sessions")
        .where("id", "=", sessionId)
        .executeTakeFirst();
    });
  }

  async getById(sessionId: string): Promise<ChatSessionData | null> {
    const sessionRow = await this.db
      .selectFrom("chat_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!sessionRow) {
      return null;
    }

    const messageRows = await this.db
      .selectFrom("chat_messages")
      .selectAll()
      .where("chatSessionId", "=", sessionId)
      .orderBy("messageIndex")
      .execute();

    return this.deserializeSession(sessionRow, messageRows);
  }

  async list(): Promise<ChatSessionData[]> {
    const sessionRows = await this.db
      .selectFrom("chat_sessions")
      .selectAll()
      .execute();

    if (sessionRows.length === 0) {
      return [];
    }

    const messages = await this.db
      .selectFrom("chat_messages")
      .selectAll()
      .where(
        "chatSessionId",
        "in",
        sessionRows.map((row) => row.id),
      )
      .execute();

    const groupedMessages = new Map<string, ChatMessageRow[]>();
    for (const message of messages) {
      const group = groupedMessages.get(message.chatSessionId) ?? [];
      group.push(message);
      groupedMessages.set(message.chatSessionId, group);
    }

    return sessionRows.map((row) => {
      const messageRows = groupedMessages.get(row.id) ?? [];
      messageRows.sort((a, b) => a.messageIndex - b.messageIndex);
      return this.deserializeSession(row, messageRows);
    });
  }

  async findByScriptPath(scriptPath: string): Promise<ChatSessionData | null> {
    const sessionRow = await this.db
      .selectFrom("chat_sessions")
      .selectAll()
      .where("scriptPath", "=", path.resolve(scriptPath))
      .orderBy("updatedAt", "desc")
      .executeTakeFirst();

    if (!sessionRow) {
      return null;
    }

    const messageRows = await this.db
      .selectFrom("chat_messages")
      .selectAll()
      .where("chatSessionId", "=", sessionRow.id)
      .orderBy("messageIndex")
      .execute();

    return this.deserializeSession(sessionRow, messageRows);
  }

  async findByScriptHash(scriptHash: string): Promise<ChatSessionData[]> {
    if (!scriptHash) {
      return [];
    }

    const sessionRows = await this.db
      .selectFrom("chat_sessions")
      .selectAll()
      .where("scriptHash", "=", scriptHash)
      .orderBy("updatedAt", "desc")
      .execute();

    if (sessionRows.length === 0) {
      return [];
    }

    const messages = await this.db
      .selectFrom("chat_messages")
      .selectAll()
      .where(
        "chatSessionId",
        "in",
        sessionRows.map((row) => row.id),
      )
      .execute();

    const groupedMessages = new Map<string, ChatMessageRow[]>();
    for (const message of messages) {
      const group = groupedMessages.get(message.chatSessionId) ?? [];
      group.push(message);
      groupedMessages.set(message.chatSessionId, group);
    }

    return sessionRows.map((row) => {
      const messageRows = groupedMessages.get(row.id) ?? [];
      messageRows.sort((a, b) => a.messageIndex - b.messageIndex);
      return this.deserializeSession(row, messageRows);
    });
  }

  private serializeSession(session: ChatSessionData): NewChatSessionRow {
    const metadata = this.safeJsonStringify(session.metadata);

    return {
      id: session.id,
      sessionType: session.sessionType,
      sessionStatus: session.sessionStatus,
      metadata,
      scriptPath: session.scriptPath ? path.resolve(session.scriptPath) : null,
      scriptModifiedAt: session.scriptModifiedAt?.toISOString() ?? null,
      scriptHash: session.scriptHash ?? null,
      scriptSnapshot: session.scriptSnapshot ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    } satisfies NewChatSessionRow;
  }

  private serializeMessages(
    sessionId: string,
    messages: ChatMessage[],
  ): NewChatMessageRow[] {
    return messages.map((message, index) => {
      return {
        id: message.id,
        chatSessionId: sessionId,
        messageIndex: index,
        payload: JSON.stringify(message.message),
        metadata: JSON.stringify({
          ...message.metadata,
          timestamp: message.metadata.timestamp.toISOString(),
        }),
      } satisfies NewChatMessageRow;
    });
  }

  private deserializeSession(
    sessionRow: ChatSessionRow,
    messageRows: ChatMessageRow[],
  ): ChatSessionData {
    const metadata = sessionRow.metadata
      ? ((JSON.parse(sessionRow.metadata) as ChatMetadata) ?? undefined)
      : undefined;

    const session: ChatSessionData = {
      id: sessionRow.id,
      sessionType: sessionRow.sessionType,
      sessionStatus: sessionRow.sessionStatus as ChatSessionStatus,
      messages: messageRows
        .sort((a, b) => a.messageIndex - b.messageIndex)
        .map((row) => this.deserializeMessage(row)),
      metadata,
      scriptPath: sessionRow.scriptPath ?? null,
      scriptModifiedAt: sessionRow.scriptModifiedAt
        ? new Date(sessionRow.scriptModifiedAt)
        : null,
      scriptHash: sessionRow.scriptHash ?? null,
      scriptSnapshot: sessionRow.scriptSnapshot ?? null,
      createdAt: new Date(sessionRow.createdAt),
      updatedAt: new Date(sessionRow.updatedAt),
    };

    return ChatSessionDataSchema.parse(session);
  }

  private deserializeMessage(row: ChatMessageRow): ChatMessage {
    const payload = JSON.parse(row.payload) as unknown;
    const metadata = JSON.parse(row.metadata) as {
      timestamp: string;
      subtaskId?: string;
      taskId?: string;
      fileReferences?: { path: string; md5: string }[];
    };

    const parsed = ChatMessageSchema.parse({
      id: row.id,
      message: payload,
      metadata: {
        ...metadata,
        timestamp: new Date(metadata.timestamp),
      },
    });

    return parsed;
  }

  private safeJsonStringify(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
}
