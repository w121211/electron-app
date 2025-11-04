// src/renderer/src/services/renderer-prompt-service.ts
import type { Prompt } from "../../../core/services/prompt/prompt-types.js";
import { trpcClient } from "../lib/trpc-client.js";

export interface CreatePromptParams {
  slug?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface UpdatePromptParams {
  slug?: string | null;
  content?: string;
  metadata?: Record<string, unknown> | null;
}

class RendererPromptService {
  async getPrompt(id: string): Promise<Prompt | null> {
    return trpcClient.prompt.get.query({ id });
  }

  async createPrompt(params: CreatePromptParams): Promise<Prompt> {
    return trpcClient.prompt.create.mutate({
      slug: params.slug ?? undefined,
      content: params.content,
      metadata: params.metadata ?? undefined,
    });
  }

  async updatePrompt(id: string, updates: UpdatePromptParams): Promise<Prompt> {
    return trpcClient.prompt.update.mutate({
      id,
      slug: updates.slug ?? undefined,
      content: updates.content,
      metadata: updates.metadata ?? undefined,
    });
  }

  async deletePrompt(id: string): Promise<void> {
    await trpcClient.prompt.delete.mutate({ id });
  }
}

export const rendererPromptService = new RendererPromptService();
