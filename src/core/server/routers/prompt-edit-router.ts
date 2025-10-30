// src/core/server/routers/prompt-edit-router.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc-init.js";
import type { PromptEditService } from "../../services/prompt/prompt-edit-service.js";

export function createPromptEditRouter(promptEditService: PromptEditService) {
  return router({
    saveEdit: publicProcedure
      .input(
        z.object({
          editId: z.string().optional(),
          draftContent: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return promptEditService.saveEdit({
          editId: input.editId,
          draftContent: input.draftContent,
        });
      }),

    getRecentEdits: publicProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return promptEditService.getRecentEdits(input.limit);
      }),
  });
}
