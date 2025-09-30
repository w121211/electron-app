// src/core/services/prompt-doc/prompt-doc-service.ts
import path from "node:path";
import {
  type PromptDocContent,
  type PromptDocConversationEntry,
  type PromptDocDocument,
  type PromptDocMetadata,
  PromptDocRepository,
} from "./prompt-doc-repository.js";

export interface CreatePromptDocInput {
  directory: string;
  id: string;
  title: string;
  modelId: string;
  tags?: string[];
  context?: string;
  initialConversation?: PromptDocConversationEntry[];
  initialLatestPrompt?: string;
  fileName?: string;
}

export interface UpdatePromptDocMetadataInput {
  absoluteFilePath: string;
  title?: string;
  modelId?: string;
  tags?: string[];
  updatedAt?: Date;
}

export interface UpdatePromptDocContextInput {
  absoluteFilePath: string;
  context?: string;
}

export interface UpdateLatestPromptInput {
  absoluteFilePath: string;
  latestPrompt: string;
}

export interface AppendReferenceInput {
  absoluteFilePath: string;
  referenceId: string;
}

export interface PromptDocLocationGuard {
  isPathInProjectFolder(absolutePath: string): Promise<boolean>;
}

export class PromptDocService {
  private readonly repository: PromptDocRepository;
  private readonly projectFolderGuard: PromptDocLocationGuard;

  constructor(
    repository: PromptDocRepository,
    projectFolderService: PromptDocLocationGuard,
  ) {
    this.repository = repository;
    this.projectFolderGuard = projectFolderService;
  }

  async createPromptDoc(
    input: CreatePromptDocInput,
  ): Promise<PromptDocDocument> {
    const directory = path.resolve(input.directory);
    if (!path.isAbsolute(directory)) {
      throw new Error(`Directory must be absolute: ${directory}`);
    }

    const isInProjectFolder =
      await this.projectFolderGuard.isPathInProjectFolder(directory);
    if (!isInProjectFolder) {
      throw new Error(
        `Cannot create prompt doc outside project folders: ${directory}`,
      );
    }

    const now = new Date();
    const metadata: PromptDocMetadata = {
      id: input.id,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      modelId: input.modelId,
      tags: sanitizeTags(input.tags),
    };

    const conversation = sanitizeConversationEntries(
      input.initialConversation ?? [],
    );

    const latestPrompt = sanitizeLatestPrompt(input.initialLatestPrompt ?? "");
    const context = input.context === undefined
      ? undefined
      : sanitizeContext(input.context);

    const content: PromptDocContent = {
      metadata,
      title: input.title,
      context,
      conversation,
      latestPrompt,
    };

    const absoluteFilePath =
      input.fileName === undefined
        ? this.repository.getFilePathForId(directory, input.id)
        : path.join(directory, ensurePromptExtension(input.fileName));

    return this.repository.create(absoluteFilePath, content);
  }

  async loadPromptDoc(absoluteFilePath: string): Promise<PromptDocDocument> {
    return this.repository.load(absoluteFilePath);
  }

  async updateLatestPrompt(
    input: UpdateLatestPromptInput,
  ): Promise<PromptDocDocument> {
    const document = await this.repository.load(input.absoluteFilePath);
    const latestPrompt = sanitizeLatestPrompt(input.latestPrompt);
    document.latestPrompt = latestPrompt;
    document.metadata = updateTimestamps(document.metadata, new Date());
    return this.repository.save(document);
  }

  async commitLatestPrompt(absoluteFilePath: string): Promise<PromptDocDocument> {
    const document = await this.repository.load(absoluteFilePath);
    const normalizedPrompt = sanitizeUserMessage(document.latestPrompt);
    if (normalizedPrompt.length === 0) {
      throw new Error("Cannot commit an empty prompt");
    }

    document.conversation = [
      ...document.conversation,
      { kind: "user", content: normalizedPrompt },
    ];
    document.latestPrompt = "";
    document.metadata = updateTimestamps(document.metadata, new Date());
    return this.repository.save(document);
  }

  async appendModelReference(
    input: AppendReferenceInput,
  ): Promise<PromptDocDocument> {
    return this.appendReference(input, "model");
  }

  async appendToolCallReference(
    input: AppendReferenceInput,
  ): Promise<PromptDocDocument> {
    return this.appendReference(input, "tool_call");
  }

  async appendToolResultReference(
    input: AppendReferenceInput,
  ): Promise<PromptDocDocument> {
    return this.appendReference(input, "tool_result");
  }

  async updateMetadata(
    input: UpdatePromptDocMetadataInput,
  ): Promise<PromptDocDocument> {
    const document = await this.repository.load(input.absoluteFilePath);

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length === 0) {
        throw new Error("Prompt doc title cannot be empty");
      }
      document.title = title;
      document.metadata = {
        ...document.metadata,
        title,
      };
    }

    if (input.modelId !== undefined) {
      const modelId = input.modelId.trim();
      if (modelId.length === 0) {
        throw new Error("Model id cannot be empty");
      }
      document.metadata = {
        ...document.metadata,
        modelId,
      };
    }

    if (input.tags !== undefined) {
      document.metadata = {
        ...document.metadata,
        tags: sanitizeTags(input.tags),
      };
    }

    const updatedAt = input.updatedAt ?? new Date();
    document.metadata = updateTimestamps(document.metadata, updatedAt);

    return this.repository.save(document);
  }

  async updateContext(
    input: UpdatePromptDocContextInput,
  ): Promise<PromptDocDocument> {
    const document = await this.repository.load(input.absoluteFilePath);
    document.context =
      input.context === undefined
        ? undefined
        : sanitizeContext(input.context);
    document.metadata = updateTimestamps(document.metadata, new Date());
    return this.repository.save(document);
  }

  private async appendReference(
    input: AppendReferenceInput,
    kind: "model" | "tool_call" | "tool_result",
  ): Promise<PromptDocDocument> {
    const document = await this.repository.load(input.absoluteFilePath);
    const referenceId = sanitizeReferenceId(input.referenceId);
    document.conversation = [
      ...document.conversation,
      { kind, referenceId },
    ];
    document.metadata = updateTimestamps(document.metadata, new Date());
    return this.repository.save(document);
  }
}

function updateTimestamps(
  metadata: PromptDocMetadata,
  updatedAt: Date,
): PromptDocMetadata {
  return {
    ...metadata,
    updatedAt,
  };
}

function sanitizeTags(tags?: string[]): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }

  return Array.from(unique);
}

function sanitizeConversationEntries(
  entries: PromptDocConversationEntry[],
): PromptDocConversationEntry[] {
  return entries.map((entry) => {
    if (entry.kind === "user") {
      return {
        kind: "user",
        content: sanitizeUserMessage(entry.content),
      };
    }

    return {
      kind: entry.kind,
      referenceId: sanitizeReferenceId(entry.referenceId),
    };
  });
}

function sanitizeUserMessage(message: string): string {
  const normalized = message.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const trimmed = trimPromptBlock(lines);
  return trimmed.join("\n");
}

function sanitizeLatestPrompt(prompt: string): string {
  return prompt.replace(/\r\n/g, "\n");
}

function sanitizeReferenceId(referenceId: string): string {
  const trimmed = referenceId.trim();
  if (trimmed.length === 0) {
    throw new Error("Reference id cannot be empty");
  }
  return trimmed;
}

function sanitizeContext(context: string): string {
  return sanitizeLatestPrompt(context).trim();
}

function trimPromptBlock(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]!.trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1]!.trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function ensurePromptExtension(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    throw new Error("File name cannot be empty");
  }

  if (/[\\/]/.test(trimmed)) {
    throw new Error("File name must not contain path separators");
  }

  if (trimmed.endsWith(".prompt.md")) {
    return trimmed;
  }

  return `${trimmed}.prompt.md`;
}
