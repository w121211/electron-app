// src/core/services/prompt/prompt-edit-repository.ts
import { z } from "zod";
import { Kysely, type Insertable, type Selectable } from "kysely";
import {
  openAppDatabase,
  type AppDatabase,
} from "../../database/sqlite-client";

export interface PromptEdit {
  id: string;
  promptScriptPath: string | null; // NULL = pure draft, non-NULL = linked to script
  contentDraft: string | null; // Stores draft text or preview snippet
  updatedAt: Date;
}

export const PromptEditSchema: z.ZodType<PromptEdit> = z.object({
  id: z.string(),
  promptScriptPath: z.string().nullable(),
  contentDraft: z.string().nullable(),
  updatedAt: z.coerce.date(),
});

export interface PromptEditRepository {
  create(promptEdit: PromptEdit): Promise<PromptEdit>;
  update(
    id: string,
    updates: Partial<Omit<PromptEdit, "id">>,
  ): Promise<PromptEdit>;
  findById(id: string): Promise<PromptEdit | null>;
  findByScriptPath(scriptPath: string): Promise<PromptEdit | null>;
  listRecent(limit?: number): Promise<PromptEdit[]>;
  delete(id: string): Promise<void>;
}

type PromptEditRow = Selectable<AppDatabase["prompt_drafts"]>;
type NewPromptEditRow = Insertable<AppDatabase["prompt_drafts"]>;

interface PromptEditRepositoryOptions {
  databaseFilePath: string;
}

export class PromptEditRepositoryImpl implements PromptEditRepository {
  private readonly db: Kysely<AppDatabase>;

  constructor(options: PromptEditRepositoryOptions) {
    this.db = openAppDatabase(options.databaseFilePath);
  }

  async create(promptEdit: PromptEdit): Promise<PromptEdit> {
    const row = this.serializePromptEdit(promptEdit);

    const created = await this.db
      .insertInto("prompt_drafts")
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.deserializePromptEdit(created);
  }

  async update(
    id: string,
    updates: Partial<Omit<PromptEdit, "id">>,
  ): Promise<PromptEdit> {
    const serializedUpdates: Partial<Omit<NewPromptEditRow, "id">> = {};

    if (updates.promptScriptPath !== undefined) {
      serializedUpdates.prompt_script_path = updates.promptScriptPath;
    }
    if (updates.contentDraft !== undefined) {
      serializedUpdates.content_draft = updates.contentDraft;
    }
    if (updates.updatedAt !== undefined) {
      serializedUpdates.updated_at = updates.updatedAt.toISOString();
    }

    const updated = await this.db
      .updateTable("prompt_drafts")
      .set(serializedUpdates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.deserializePromptEdit(updated);
  }

  async findById(id: string): Promise<PromptEdit | null> {
    const row = await this.db
      .selectFrom("prompt_drafts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserializePromptEdit(row);
  }

  async findByScriptPath(scriptPath: string): Promise<PromptEdit | null> {
    const row = await this.db
      .selectFrom("prompt_drafts")
      .selectAll()
      .where("prompt_script_path", "=", scriptPath)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserializePromptEdit(row);
  }

  async listRecent(limit = 50): Promise<PromptEdit[]> {
    const rows = await this.db
      .selectFrom("prompt_drafts")
      .selectAll()
      .orderBy("updated_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.deserializePromptEdit(row));
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("prompt_drafts").where("id", "=", id).execute();
  }

  private serializePromptEdit(promptEdit: PromptEdit): NewPromptEditRow {
    return {
      id: promptEdit.id,
      prompt_script_path: promptEdit.promptScriptPath,
      content_draft: promptEdit.contentDraft,
      updated_at: promptEdit.updatedAt.toISOString(),
    };
  }

  private deserializePromptEdit(row: PromptEditRow): PromptEdit {
    const promptEdit: PromptEdit = {
      id: row.id,
      promptScriptPath: row.prompt_script_path,
      contentDraft: row.content_draft,
      updatedAt: new Date(row.updated_at),
    };

    return PromptEditSchema.parse(promptEdit);
  }
}
