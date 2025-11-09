// src/renderer/src/services/model-client-service.ts

import { Logger } from "tslog";
import { setAvailableModels, setSelectedModel } from "../stores/chat.svelte.js";
import { setAvailableModels as setAvailableModelsV2, setSelectedModel as setSelectedModelV2 } from "../stores/ui-v2-store.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import { setPreference, getPreference } from "../lib/local-storage.js";
import type { ModelId } from "../../../core/utils/model-utils-v2.js";

const logger = new Logger({ name: "ModelClientService" });

export class ModelClientService {
  selectModel(modelId: `${string}:${string}`): void {
    setSelectedModel(modelId);
    setPreference("selectedModel", modelId);
  }

  async hydrateAvailableModels(): Promise<void> {
    const models = await trpcClient.model.getAvailableModelsV2.query();
    setAvailableModels(models);
    logger.info(`Loaded ${models.length} available models.`);
  }

  // V2 Methods
  selectModelV2(modelId: ModelId): void {
    setSelectedModelV2(modelId);
    setPreference("selectedModelV2", modelId);
  }

  async hydrateAvailableModelsV2(): Promise<void> {
    const models = await trpcClient.model.getAvailableModelsV2.query();
    setAvailableModelsV2(models);
    logger.info(`Loaded ${models.length} available models (v2).`);

    // Load saved preference or use default
    const savedModel = getPreference("selectedModelV2") as ModelId | null;
    if (savedModel) {
      setSelectedModelV2(savedModel);
    }
  }
}

export const modelClientService = new ModelClientService();
