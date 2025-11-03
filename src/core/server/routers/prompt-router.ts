// src/core/server/routers/prompt-router.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc-init.js";
import type { PromptService } from "../../services/prompt/prompt-service.js";

interface CreatePromptRouterDependencies {
  promptService: PromptService;
}

const listInputSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

const getInputSchema = z.object({
  id: z.string(),
});

const createInputSchema = z.object({
  slug: z.string().nullable().optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const updateInputSchema = z.object({
  id: z.string(),
  slug: z.string().nullable().optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const deleteInputSchema = z.object({
  id: z.string(),
});

export function createPromptRouter({
  promptService,
}: CreatePromptRouterDependencies) {
  return router({
    list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
      const prompts = await promptService.listPrompts();

      if (!input?.limit) {
        return prompts;
      }

      return prompts.slice(0, input.limit);
    }),
    get: publicProcedure.input(getInputSchema).query(async ({ input }) => {
      return promptService.getPrompt(input.id);
    }),
    create: publicProcedure
      .input(createInputSchema)
      .mutation(async ({ input }) => {
        const metadata = (
          input.metadata !== undefined ? (input.metadata ?? null) : undefined
        ) as typeof input.metadata | null | undefined;

        return promptService.createPrompt({
          slug: input.slug ?? undefined,
          content: input.content,
          metadata,
        });
      }),
    update: publicProcedure
      .input(updateInputSchema)
      .mutation(async ({ input }) => {
        const metadata = (
          input.metadata !== undefined ? (input.metadata ?? null) : undefined
        ) as typeof input.metadata | null | undefined;

        return promptService.updatePrompt(input.id, {
          slug: input.slug ?? undefined,
          content: input.content,
          metadata,
        });
      }),
    delete: publicProcedure
      .input(deleteInputSchema)
      .mutation(async ({ input }) => {
        await promptService.deletePrompt(input.id);
      }),
  });
}

export type PromptRouter = ReturnType<typeof createPromptRouter>;
