// src/core/server/routers/prompt-script-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import type { PromptScriptService } from "../../services/prompt-script/prompt-script-service.js";

export function createPromptScriptRouter(promptScriptService: PromptScriptService) {
  return router({
    create: publicProcedure
      .input(
        z.object({
          directory: z.string(),
          name: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptScriptService.createPromptScript(input.directory, input.name);
      }),

    findLinkedSession: publicProcedure
      .input(z.object({ filePath: z.string() }))
      .query(async ({ input }) => {
        return promptScriptService.findLinkedChatSession(input.filePath);
      }),

    linkSession: publicProcedure
      .input(
        z.object({
          scriptPath: z.string(),
          sessionId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptScriptService.linkChatSession({
          scriptPath: input.scriptPath,
          sessionId: input.sessionId,
        });
      }),

    unlinkSession: publicProcedure
      .input(
        z.object({
          scriptPath: z.string(),
          sessionId: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptScriptService.unlinkChatSession({
          scriptPath: input.scriptPath,
          sessionId: input.sessionId,
        });
      }),
  });
}
