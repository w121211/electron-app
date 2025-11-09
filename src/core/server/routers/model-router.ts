// src/core/server/routers/model-router.ts
import { z } from "zod";
import { ModelService } from "../../services/model-service.js";
import { router, publicProcedure } from "../trpc-init.js";

export function createModelRouter(modelService: ModelService) {
  return router({
    // Get all available models
    getAvailableModels: publicProcedure.query(async () => {
      return modelService.getAvailableModelsV2();
    }),

    // V2 Endpoints
    getAvailableModelsV2: publicProcedure.query(async () => {
      return modelService.getAvailableModelsV2();
    }),

    getApiModelsV2: publicProcedure.query(async () => {
      return modelService.getApiModelsV2();
    }),

    getCliModelsV2: publicProcedure.query(async () => {
      return modelService.getCliModelsV2();
    }),

    getWebModelsV2: publicProcedure.query(async () => {
      return modelService.getWebModelsV2();
    }),

    isModelEnabledV2: publicProcedure
      .input(
        z.object({
          modelId: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return modelService.isModelEnabledV2(input.modelId);
      }),
  });
}
