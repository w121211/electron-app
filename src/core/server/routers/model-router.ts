// src/core/server/routers/model-router.ts
import { z } from "zod";
import { ModelService } from "../../services/model-service.js";
import { router, publicProcedure } from "../trpc-init.js";

export function createModelRouter(modelService: ModelService) {
  return router({
    // Get all available models (external and api)
    getAvailableModels: publicProcedure.query(async () => {
      return modelService.getAvailableModels();
    }),

    // Get external models only
    getExternalModels: publicProcedure.query(async () => {
      return modelService.getExternalModels();
    }),

    // Get API models only
    getApiModels: publicProcedure.query(async () => {
      return modelService.getApiModels();
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

    // Check if API model is enabled
    isApiModelEnabled: publicProcedure
      .input(
        z.object({
          modelId: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return modelService.isApiModelEnabled(input.modelId);
      }),
  });
}
