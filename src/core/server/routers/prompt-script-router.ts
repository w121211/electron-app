// src/core/server/routers/prompt-script-router.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc-init.js";
import type { PromptScriptService } from "../../services/prompt-script/prompt-script-service.js";

export function createPromptScriptRouter(
  promptScriptService: PromptScriptService,
) {
  return router({
    create: publicProcedure
      .input(
        z.object({
          directory: z.string(),
          name: z.string().optional(),
          templatePath: z.string().optional(),
          args: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptScriptService.createPromptScript(
          input.directory,
          input.name,
          {
            templatePath: input.templatePath,
            args: input.args,
          },
        );
      }),

    linkChatSession: publicProcedure
      .input(
        z.object({
          promptScriptPath: z.string(),
          chatSessionId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptScriptService.linkChatSession(
          input.promptScriptPath,
          input.chatSessionId,
        );
      }),

    findLinkedChatSession: publicProcedure
      .input(
        z.object({
          filePath: z.string(),
        }),
      )
      .query(async ({ input }) => {
        const result = await promptScriptService.findLinkedChatSession(
          input.filePath,
        );
        return result;
      }),
  });
}
