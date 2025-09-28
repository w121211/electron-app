// src/core/server/routers/chat-draft-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import { ChatDraftService } from "../../services/chat-engine/chat-draft-service.js";
import type { ChatSessionData } from "../../services/chat-engine/chat-session-repository.js";

const createChatDraftConfigSchema = z.object({
  mode: z.enum(["chat", "agent"]).default("chat"),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
  newTask: z.boolean().optional(),
});

const draftUpdatesSchema = z.object({
  metadata: z
    .object({
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
      mode: z.enum(["chat", "agent"]).optional(),
      knowledge: z.array(z.string()).optional(),
      promptDraft: z.string().optional(),
      external: z.any().optional(),
    })
    .optional(),
  maxTurns: z.number().optional(),
});

export function createChatDraftRouter(chatDraftService: ChatDraftService) {
  return router({
    createDraft: publicProcedure
      .input(
        z.object({
          targetDirectory: z.string(),
          config: createChatDraftConfigSchema.optional(),
        }),
      )
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        return await chatDraftService.createDraft(
          input.targetDirectory,
          input.config,
        );
      }),

    createDraftFromTemplate: publicProcedure
      .input(
        z.object({
          templatePath: z.string(),
          args: z.array(z.string()),
          targetDirectory: z.string(),
          config: createChatDraftConfigSchema.optional(),
        }),
      )
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        return await chatDraftService.createDraftFromTemplate(
          input.templatePath,
          input.targetDirectory,
          input.args,
          input.config,
        );
      }),

    getDraft: publicProcedure
      .input(z.object({ absoluteFilePath: z.string() }))
      .query(async ({ input }): Promise<ChatSessionData> => {
        return await chatDraftService.getDraft(input.absoluteFilePath);
      }),

    updateDraft: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          updates: draftUpdatesSchema,
        }),
      )
      .mutation(async ({ input }) => {
        await chatDraftService.updateDraft(
          input.absoluteFilePath,
          input.updates,
        );
        return await chatDraftService.getDraft(input.absoluteFilePath);
      }),

    deleteDraft: publicProcedure
      .input(z.object({ absoluteFilePath: z.string() }))
      .mutation(async ({ input }) => {
        await chatDraftService.deleteDraft(input.absoluteFilePath);
        return { success: true };
      }),
  });
}

export type ChatDraftRouter = ReturnType<typeof createChatDraftRouter>;
