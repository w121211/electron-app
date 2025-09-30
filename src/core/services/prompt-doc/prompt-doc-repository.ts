// src/core/services/prompt-doc/prompt-doc-repository.ts
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeTextFile } from "../../utils/file-utils.js";
import {
  ensurePromptDocContentConsistency,
  parsePromptDoc,
  serializePromptDoc,
  type PromptDocContent,
} from "./prompt-doc-parser.js";

export type {
  PromptDocContent,
  PromptDocMetadata,
  PromptDocConversationEntry,
} from "./prompt-doc-parser.js";

export interface PromptDocDocument extends PromptDocContent {
  absoluteFilePath: string;
}

export class PromptDocRepository {
  private readonly extension = ".prompt.md";

  async load(absoluteFilePath: string): Promise<PromptDocDocument> {
    const absolutePath = path.resolve(absoluteFilePath);
    const content = await fs.readFile(absolutePath, "utf8");
    const parsed = ensurePromptDocContentConsistency(parsePromptDoc(content));
    return {
      ...parsed,
      absoluteFilePath: absolutePath,
    };
  }

  async save(document: PromptDocDocument): Promise<PromptDocDocument> {
    const normalized = ensurePromptDocContentConsistency(document);
    const serialized = serializePromptDoc(normalized);
    await writeTextFile(normalized.absoluteFilePath, serialized);
    return normalized;
  }

  async create(
    absoluteFilePath: string,
    content: PromptDocContent,
  ): Promise<PromptDocDocument> {
    const absolutePath = path.resolve(absoluteFilePath);
    if (await fileExists(absolutePath)) {
      throw new Error(`Prompt document already exists: ${absolutePath}`);
    }

    const normalized = ensurePromptDocContentConsistency(content);
    const serialized = serializePromptDoc(normalized);
    await writeTextFile(absolutePath, serialized);

    return {
      ...normalized,
      absoluteFilePath: absolutePath,
    };
  }

  getFilePathForId(directory: string, identifier: string): string {
    const safeIdentifier = this.toSafeFileName(identifier);
    return path.join(directory, `${safeIdentifier}${this.extension}`);
  }

  private toSafeFileName(identifier: string): string {
    const replaced = identifier.replace(/[^a-zA-Z0-9-_]+/g, "-");
    if (replaced.length === 0) {
      return "prompt";
    }
    return replaced;
  }
}
