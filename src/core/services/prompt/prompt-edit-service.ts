// src/core/services/prompt/prompt-edit-service.ts
import { randomUUID } from "node:crypto";
import type { PromptEditRepository, PromptEdit } from "./prompt-edit-repository.js";

export class PromptEditService {
  constructor(private readonly promptEditRepo: PromptEditRepository) {}

  async saveEdit(params: {
    editId?: string;
    draftContent: string;
  }): Promise<PromptEdit> {
    const now = new Date();

    if (params.editId) {
      const existing = await this.promptEditRepo.findById(params.editId);
      if (!existing) {
        throw new Error(`Prompt edit ${params.editId} not found`);
      }

      return this.promptEditRepo.update(params.editId, {
        contentDraft: params.draftContent,
        updatedAt: now,
      });
    }

    const newEdit: PromptEdit = {
      id: randomUUID(),
      promptScriptPath: null,
      contentDraft: params.draftContent,
      updatedAt: now,
    };

    return this.promptEditRepo.create(newEdit);
  }

  async getRecentEdits(limit = 50): Promise<PromptEdit[]> {
    return this.promptEditRepo.listRecent(limit);
  }
}
