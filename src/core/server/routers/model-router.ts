// src/core/server/routers/model-router.ts
import { z } from "zod";
import { ModelService } from "../../services/model-service.js";
import { router, publicProcedure } from "../trpc-init.js";

export function createModelRouter(modelService: ModelService) {
  return router({
    // Get all available models (external and internal)
    getAvailableModels: publicProcedure.query(async () => {
      return modelService.getAvailableModels();
    }),

    // Get external models only
    getExternalModels: publicProcedure.query(async () => {
      return modelService.getExternalModels();
    }),

    // Get internal models only
    getInternalModels: publicProcedure.query(async () => {
      return modelService.getInternalModels();
    }),

    // Check if external model is enabled
    isExternalModelEnabled: publicProcedure
      .input(
        z.object({
          modelId: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return modelService.isExternalModelEnabled(input.modelId);
      }),

    // Check if internal model is enabled
    isInternalModelEnabled: publicProcedure
      .input(
        z.object({
          modelId: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return modelService.isInternalModelEnabled(input.modelId);
      }),
  });
}
