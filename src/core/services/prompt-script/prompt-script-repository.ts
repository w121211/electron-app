// src/core/services/prompt-script/prompt-script-repository.ts
import matter from "gray-matter";
import { fileExists, writeTextFile } from "../../utils/file-utils.js";
import {
  readDocument,
  type DocumentFile,
} from "../document/document-repository.js";
import { parsePromptScriptContent } from "./prompt-script-parser.js";
import type { ChatSessionData } from "../chat/chat-session-repository.js";

export type PromptScriptEngine = "api" | "pty";

export type PromptScriptWarning =
  | { code: "CHAT_SESSION_NOT_FOUND"; message: string; chatSessionId: string }
  | { code: "PARSE_ERROR"; message: string };

export interface PromptScriptMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  engine: PromptScriptEngine;
  engineDefinedInSource: boolean;
  modelId?: string;
  chatSessionId?: string;
  extras: Record<string, unknown>;
}

export interface PromptScriptPrompt {
  index: number;
  content: string;
  attributes?: Record<string, string>;
}

export interface ParsePromptScriptResult {
  metadata: PromptScriptMetadata;
  prompts: PromptScriptPrompt[];
  body: string;
  warnings: PromptScriptWarning[];
  delimiter: string;
}

export interface PromptScriptFile extends DocumentFile {
  promptScriptParsed: ParsePromptScriptResult;
}

export interface PromptScriptLinkResult {
  promptScript: PromptScriptFile;
  chatSession: ChatSessionData | null;
  warnings: PromptScriptWarning[];
}

export class PromptScriptRepository {
  async create(filePath: string, content = ""): Promise<PromptScriptFile> {
    if (await fileExists(filePath)) {
      throw new Error(`File already exists: ${filePath}`);
    }

    await writeTextFile(filePath, content);
    return this.read(filePath);
  }

  async read(filePath: string): Promise<PromptScriptFile> {
    const document = await readDocument(filePath);
    const parsed: ParsePromptScriptResult = parsePromptScriptContent(
      document.content,
    );

    const promptScript: PromptScriptFile = {
      ...document,
      kind: "promptScript",
      promptScriptParsed: parsed,
    };

    return promptScript;
  }

  async save(
    script: PromptScriptFile,
    options: {
      metadata?: PromptScriptMetadata;
      body?: string;
    } = {},
  ): Promise<PromptScriptFile> {
    if (!(await fileExists(script.absolutePath))) {
      throw new Error(
        `File does not exist: ${script.absolutePath}. Use create() for new files, save() only updates existing files.`,
      );
    }
    const metadata = options.metadata ?? script.promptScriptParsed.metadata;
    const body = options.body ?? script.promptScriptParsed.body;

    const serialized = matter.stringify(body, this.serializeMetadata(metadata));
    await writeTextFile(script.absolutePath, serialized);

    return this.read(script.absolutePath);
  }

  private serializeMetadata(
    metadata: PromptScriptMetadata,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {
      ...metadata.extras,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      modelId: metadata.modelId,
      chatSessionId: metadata.chatSessionId,
    };

    if (metadata.engineDefinedInSource || metadata.engine !== "pty") {
      data.engine = metadata.engine;
    }

    // Remove undefined values to prevent YAML serialization errors
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        delete data[key];
      }
    }

    return data;
  }
}
