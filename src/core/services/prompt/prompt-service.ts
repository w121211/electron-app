// src/core/services/prompt/prompt-service.ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { PromptRepository } from "./prompt-repository.js";
import type {
  Prompt,
  PromptMetadata,
  PromptSnapshot,
  PromptSeedResult,
} from "./prompt-types.js";

export interface CreatePromptInput {
  slug?: string | null;
  content: string;
  metadata?: PromptMetadata | null;
}

export interface UpdatePromptInput {
  slug?: string | null;
  content?: string;
  metadata?: PromptMetadata | null;
}

export interface PromptServiceDependencies {
  repository: PromptRepository;
}

export class PromptService {
  private readonly repository: PromptRepository;

  constructor(dependencies: PromptServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async createPrompt(input: CreatePromptInput): Promise<Prompt> {
    const id = randomUUID();

    return this.repository.create({
      id,
      slug: input.slug ?? null,
      content: input.content,
      metadata: input.metadata ?? null,
    });
  }

  async updatePrompt(id: string, updates: UpdatePromptInput): Promise<Prompt> {
    return this.repository.update(id, {
      slug: updates.slug ?? null,
      content: updates.content,
      metadata: updates.metadata ?? null,
    });
  }

  async deletePrompt(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async getPrompt(id: string): Promise<Prompt | null> {
    return this.repository.getById(id);
  }

  async findBySlug(slug: string): Promise<Prompt | null> {
    return this.repository.findBySlug(slug);
  }

  async listPrompts(): Promise<Prompt[]> {
    return this.repository.list();
  }

  async searchPrompts(filters: {
    text?: string;
    tag?: string;
    limit?: number;
  }): Promise<Prompt[]> {
    return this.repository.search(filters);
  }

  buildSnapshot(
    prompt: Prompt,
    args?: Record<string, unknown>,
  ): PromptSnapshot {
    return {
      promptId: prompt.id,
      slug: prompt.slug,
      content: prompt.content,
      metadata: prompt.metadata,
      capturedAt: new Date().toISOString(),
      args: args && Object.keys(args).length > 0 ? { ...args } : undefined,
    };
  }

  applyPromptArgs(content: string, args: Record<string, unknown>): string {
    return Object.entries(args).reduce((buffer, [key, value]) => {
      const token = `{{${key}}}`;
      const replacement =
        value === undefined || value === null ? "" : String(value);
      return buffer.replaceAll(token, replacement);
    }, content);
  }

  async seedBuiltInPrompts(directory: string): Promise<PromptSeedResult> {
    const entries = await safeReadDir(directory);
    if (entries.length === 0) {
      return { created: 0, updated: 0, skipped: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry);
      const stat = await safeStat(absolutePath);

      if (!stat?.isFile() || !entry.endsWith(".prompt.md")) {
        continue;
      }

      const fileContent = await fs.readFile(absolutePath, "utf-8");
      const parsed = matter(fileContent);

      const slug = deriveSlug(entry);
      const metadata = normalizeMetadata(parsed.data);
      const existing = await this.repository.findBySlug(slug);

      if (!existing) {
        await this.repository.create({
          id: randomUUID(),
          slug,
          content: parsed.content,
          metadata,
        });
        created += 1;
        continue;
      }

      if (
        existing.content === parsed.content &&
        shallowEqual(existing.metadata ?? {}, metadata ?? {})
      ) {
        skipped += 1;
        continue;
      }

      await this.repository.update(existing.id, {
        slug,
        content: parsed.content,
        metadata,
        updatedAt: new Date(),
      });
      updated += 1;
    }

    return { created, updated, skipped };
  }
}

function deriveSlug(filename: string): string {
  return filename.replace(/\.prompt\.md$/i, "");
}

async function safeReadDir(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function safeStat(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function normalizeMetadata(data: unknown): PromptMetadata | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  return { ...(data as Record<string, unknown>) };
}

function shallowEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}
