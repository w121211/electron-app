// src/renderer/src/services/model-client-service.ts

import { Logger } from "tslog";
import { setAvailableModels, setSelectedModel } from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import { setPreference } from "../lib/local-storage.js";

const logger = new Logger({ name: "ModelClientService" });

export class ModelClientService {
  selectModel(modelId: `${string}/${string}`): void {
    setSelectedModel(modelId);
    setPreference("selectedModel", modelId);
  }

  async hydrateAvailableModels(): Promise<void> {
    const response = await trpcClient.model.getAvailableModels.query();
    setAvailableModels(response);
    const totalModels =
      Object.keys(response.external).length +
      Object.keys(response.api).length;
    logger.info(`Loaded ${totalModels} available models.`);
  }
}

export const modelClientService = new ModelClientService();
