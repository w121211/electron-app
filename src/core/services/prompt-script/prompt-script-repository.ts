// src/core/services/prompt-script/prompt-script-repository.ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { fileExists, writeTextFile } from "../../utils/file-utils.js";
import {
  parsePromptScriptContent,
  type ParsePromptScriptResult,
  type PromptScriptMetadata,
  type PromptScriptPrompt,
} from "./prompt-script-parser.js";

export interface PromptScriptFile {
  absolutePath: string;
  content: string;
  body: string;
  metadata: PromptScriptMetadata;
  prompts: PromptScriptPrompt[];
  hash: string;
  modifiedAt: Date;
  warnings: string[];
  delimiter: string;
}

export class PromptScriptRepository {
  async read(filePath: string): Promise<PromptScriptFile> {
    const absolutePath = path.resolve(filePath);

    if (!(await fileExists(absolutePath))) {
      throw new Error(`File does not exist: ${absolutePath}`);
    }

    const content = await fs.readFile(absolutePath, "utf8");
    const stats = await fs.stat(absolutePath);

    const parsed: ParsePromptScriptResult = parsePromptScriptContent(content);

    return {
      absolutePath,
      content,
      body: parsed.body,
      metadata: parsed.metadata,
      prompts: parsed.prompts,
      hash: this.createContentHash(content),
      modifiedAt: stats.mtime,
      warnings: parsed.warnings,
      delimiter: parsed.delimiter,
    };
  }

  async save(
    script: PromptScriptFile,
    options: {
      metadata?: PromptScriptMetadata;
      body?: string;
    } = {},
  ): Promise<PromptScriptFile> {
    const metadata = options.metadata ?? script.metadata;
    const body = options.body ?? script.body;

    const serialized = matter.stringify(body, this.serializeMetadata(metadata));
    await writeTextFile(script.absolutePath, serialized);

    return this.read(script.absolutePath);
  }

  private createContentHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private serializeMetadata(metadata: PromptScriptMetadata): Record<string, unknown> {
    const data: Record<string, unknown> = { ...metadata.extras };

    if (metadata.title !== undefined) {
      data.title = metadata.title;
    }

    if (metadata.description !== undefined) {
      data.description = metadata.description;
    }

    if (metadata.tags !== undefined) {
      data.tags = metadata.tags;
    }

    if (metadata.engineDefinedInSource || metadata.engine !== "pty") {
      data.engine = metadata.engine;
    }

    if (metadata.model !== undefined) {
      data.model = metadata.model;
    }

    if (metadata.chatSessionId !== undefined) {
      data.chatSessionId = metadata.chatSessionId;
    }

    return data;
  }
}
