// src/core/services/chat-engine/chat-session-repository.ts
import { promises as fs } from "fs";
import path from "path";
// @ts-expect-error - Intentionally unused for future use
import { ILogObj, Logger } from "tslog";
import { z } from "zod";
import { modelMessageSchema } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import {
  writeJsonFile,
  readJsonFile,
  createDirectory,
  listDirectory,
} from "../../utils/file-utils.js";

export type ChatSessionType =
  | "chat"
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

export type ChatFileStatus = "active" | "archived";

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

export interface ExternalSessionMetadata {
  mode?: "terminal" | "pty";
  // sessionId?: string; // Used for PTY mode
  pid?: number; // Used for terminal mode
  workingDirectory?: string;
  pty?: {
    ptyInstanceId?: string;
    screenshot?: string;
    screenshotHtml?: string;
  };
}

export interface ChatMetadata {
  title?: string;
  tags?: string[];
  mode?: ChatMode;
  knowledge?: string[];
  promptDraft?: string;
  external?: ExternalSessionMetadata;
}

export interface ChatSessionData {
  _type: ChatSessionType;
  id: string;
  absoluteFilePath: string;
  messages: ChatMessage[];
  modelId?: `${string}/${string}`; // Drafts omit model selection
  sessionStatus: ChatSessionStatus;
  fileStatus: ChatFileStatus;
  currentTurn: number;
  maxTurns: number;
  toolSet?: ToolSet;
  createdAt: Date;
  updatedAt: Date;
  metadata?: ChatMetadata;
}

// Zod schemas for validation and type inference
export const ModelIdSchema = z.custom<`${string}/${string}`>(
  (val) => {
    return typeof val === "string" && /^.+\/.+$/.test(val);
  },
  { message: "Model ID must be in format 'provider/model'" },
);

const ExternalSessionMetadataSchema = z.object({
  mode: z.enum(["terminal", "pty"]).optional(),
  pid: z.number().optional(), // Used for terminal mode
  workingDirectory: z.string().optional(),
  pty: z
    .object({
      ptyInstanceId: z.string().optional(),
      screenshot: z.string().optional(),
      screenshotHtml: z.string().optional(),
    })
    .optional(),
});

const ChatMetadataSchema: z.ZodType<ChatMetadata> = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
  external: ExternalSessionMetadataSchema.optional(),
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

const ChatSessionDataSchemaBase = z.object({
  _type: z.enum(["chat", "chat_draft", "external_chat", "pty_chat"]),
  id: z.string(),
  absoluteFilePath: z.string(),
  messages: z.array(ChatMessageSchema),
  modelId: ModelIdSchema.optional(),
  toolSet: z.any().optional(),
  sessionStatus: z.enum([
    "idle",
    "processing",
    "scheduled",
    "waiting_confirmation",
    "max_turns_reached",
    "external_active",
    "external_terminated",
  ]),
  fileStatus: z.enum(["active", "archived"]),
  currentTurn: z.number(),
  maxTurns: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: ChatMetadataSchema.optional(),
});

export const ChatSessionDataSchema: z.ZodType<ChatSessionData> =
  ChatSessionDataSchemaBase.superRefine((data, ctx) => {
    if (data._type !== "chat_draft" && data.modelId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active chat sessions must include a modelId",
        path: ["modelId"],
      });
    }
  });

export function isDraftSession(
  data: ChatSessionData,
): data is ChatSessionData & { _type: "chat_draft"; modelId?: undefined } {
  return data._type === "chat_draft";
}

export function isEngineSession(
  data: ChatSessionData,
): data is ChatSessionData & { _type: "chat"; modelId: `${string}/${string}` } {
  return data._type === "chat";
}

export interface ChatSessionRepository {
  saveToFile(
    absoluteFilePath: string,
    chatSession: ChatSessionData,
  ): Promise<void>;
  loadFromFile(absoluteFilePath: string): Promise<ChatSessionData>;
  deleteFile(absoluteFilePath: string): Promise<void>;
  createNewFile(
    targetDirectory: string,
    chatSession: Omit<ChatSessionData, "absoluteFilePath">,
  ): Promise<string>;
}

export class ChatSessionRepositoryImpl implements ChatSessionRepository {
  // @ts-expect-error - Intentionally unused for future use
  private readonly _logger = new Logger({ name: "ChatSessionRepository" });

  async saveToFile(
    absoluteFilePath: string,
    chatSession: ChatSessionData,
  ): Promise<void> {
    await writeJsonFile(absoluteFilePath, chatSession);
  }

  async loadFromFile(filePath: string): Promise<ChatSessionData> {
    const fileData = await readJsonFile<unknown>(filePath);
    const validatedData = ChatSessionDataSchema.parse(fileData);
    return validatedData;
  }

  async deleteFile(absoluteFilePath: string): Promise<void> {
    await fs.unlink(absoluteFilePath);
  }

  async createNewFile(
    targetDirectory: string,
    chatSession: Omit<ChatSessionData, "absoluteFilePath">,
  ): Promise<string> {
    await createDirectory(targetDirectory);
    const chatNumber = await this.getNextChatNumber(targetDirectory);
    const filePath = path.join(targetDirectory, `chat${chatNumber}.chat.json`);

    const chatData = {
      ...chatSession,
      absoluteFilePath: filePath,
    };

    await writeJsonFile(filePath, chatData);

    return filePath;
  }

  private async getNextChatNumber(folderPath: string): Promise<number> {
    const files = await listDirectory(folderPath);
    const chatNumbers = files
      .filter((file) => file.name.match(/^chat\d+\.chat\.json$/))
      .map((file) => {
        const match = file.name.match(/^chat(\d+)\.chat\.json$/);
        return match ? parseInt(match[1]!, 10) : 0;
      })
      .filter((num) => !isNaN(num));

    return chatNumbers.length > 0 ? Math.max(...chatNumbers) + 1 : 1;
  }
}
