// src/core/services/chat-engine/provider-registry.ts
import { gateway } from "@ai-sdk/gateway";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createProviderRegistry } from "ai";
import type { LanguageModelV2 } from "@ai-sdk/provider";

const openrouterBase = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const providerRegistry = createProviderRegistry({
  aigateway: gateway,
  openrouter: {
    languageModel: (modelId: string): LanguageModelV2 =>
      openrouterBase.languageModel(modelId),
    textEmbeddingModel: () => {
      throw new Error("Text embedding not supported");
    },
    imageModel: () => {
      throw new Error("Image model not supported");
    },
  },
});
