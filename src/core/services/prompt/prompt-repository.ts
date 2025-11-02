// src/core/services/prompt/prompt-repository.ts
import { Kysely, sql, type Insertable, type Selectable } from "kysely";
import { z } from "zod";
import {
  openAppDatabaseV2,
  type AppDatabaseV2,
} from "../../database/sqlite-client-v2.js";
import type { Prompt, PromptMetadata } from "./prompt-types.js";

const MetadataSchema: z.ZodType<PromptMetadata> = z
  .record(z.string(), z.unknown())
  .transform((value) => value as PromptMetadata)
  .catch(() => ({} as PromptMetadata));

type PromptRow = Selectable<AppDatabaseV2["prompts"]>;
type NewPromptRow = Insertable<AppDatabaseV2["prompts"]>;

export interface PromptRepositoryCreateInput {
  id: string;
  slug?: string | null;
  content: string;
  metadata?: PromptMetadata | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PromptRepositoryUpdateInput {
  slug?: string | null;
  content?: string;
  metadata?: PromptMetadata | null;
  updatedAt?: Date;
}

export interface PromptSearchFilters {
  text?: string;
  tag?: string;
  limit?: number;
}

export interface PromptRepository {
  create(input: PromptRepositoryCreateInput): Promise<Prompt>;
  update(id: string, updates: PromptRepositoryUpdateInput): Promise<Prompt>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Prompt | null>;
  findBySlug(slug: string): Promise<Prompt | null>;
  list(): Promise<Prompt[]>;
  search(filters: PromptSearchFilters): Promise<Prompt[]>;
}

interface PromptRepositoryOptions {
  databaseFilePath: string;
}

export class PromptRepositoryImpl implements PromptRepository {
  private readonly db: Kysely<AppDatabaseV2>;

  constructor(options: PromptRepositoryOptions) {
    this.db = openAppDatabaseV2(options.databaseFilePath);
  }

  async create(input: PromptRepositoryCreateInput): Promise<Prompt> {
    const now = new Date();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;

    const row: NewPromptRow = {
      id: input.id,
      slug: input.slug ?? null,
      content: input.content,
      metadata: this.serializeMetadata(input.metadata),
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
    };

    const inserted = await this.db
      .insertInto("prompts")
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.deserializePrompt(inserted);
  }

  async update(id: string, updates: PromptRepositoryUpdateInput): Promise<Prompt> {
    const serializedUpdates: {
      slug?: string | null;
      content?: string;
      metadata?: string | null;
      updated_at: string;
    } = {
      updated_at: (updates.updatedAt ?? new Date()).toISOString(),
    };

    if (updates.slug !== undefined) {
      serializedUpdates.slug = updates.slug ?? null;
    }
    if (updates.content !== undefined) {
      serializedUpdates.content = updates.content;
    }
    if (updates.metadata !== undefined) {
      serializedUpdates.metadata = this.serializeMetadata(updates.metadata);
    }

    const updated = await this.db
      .updateTable("prompts")
      .set(serializedUpdates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new Error(`Prompt ${id} not found`);
    }

    return this.deserializePrompt(updated);
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("prompts").where("id", "=", id).execute();
  }

  async getById(id: string): Promise<Prompt | null> {
    const row = await this.db
      .selectFrom("prompts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserializePrompt(row);
  }

  async findBySlug(slug: string): Promise<Prompt | null> {
    const row = await this.db
      .selectFrom("prompts")
      .selectAll()
      .where("slug", "=", slug)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserializePrompt(row);
  }

  async list(): Promise<Prompt[]> {
    const rows = await this.db
      .selectFrom("prompts")
      .selectAll()
      .orderBy("updated_at", "desc")
      .execute();

    return rows.map((row) => this.deserializePrompt(row));
  }

  async search(filters: PromptSearchFilters): Promise<Prompt[]> {
    let query = this.db.selectFrom("prompts").selectAll();

    if (filters.text) {
      const likePattern = `%${filters.text}%`;
      query = query.where(
        sql<boolean>`
          ${sql.ref("prompts.content")} LIKE ${likePattern}
          OR json_extract(${sql.ref(
            "prompts.metadata",
          )}, '$.title') LIKE ${likePattern}
          OR json_extract(${sql.ref(
            "prompts.metadata",
          )}, '$.description') LIKE ${likePattern}
        `,
      );
    }

    if (filters.tag) {
      query = query.where(
        sql<boolean>`
          EXISTS (
            SELECT 1 FROM json_each(${sql.ref("prompts.metadata")}, '$.tags')
            WHERE json_each.value = ${filters.tag}
          )
        `,
      );
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const rows = await query.orderBy("updated_at", "desc").execute();

    return rows.map((row) => this.deserializePrompt(row));
  }

  private serializeMetadata(metadata: PromptMetadata | null | undefined): string | null {
    if (!metadata) {
      return null;
    }

    try {
      return JSON.stringify(metadata);
    } catch (error) {
      throw new Error(
        `Failed to serialize prompt metadata: ${(error as Error).message}`,
      );
    }
  }

  private deserializePrompt(row: PromptRow): Prompt {
    const metadata =
      row.metadata !== null && row.metadata !== undefined
        ? MetadataSchema.parse(JSON.parse(row.metadata))
        : null;

    return {
      id: row.id,
      slug: row.slug,
      content: row.content,
      metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
