// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";
import {
  modelRegistry,
  type ModelConfig,
  type ApiModelConfig as ApiModelConfigV2,
  type CliModelConfig,
  type WebModelConfig,
  isApiModel,
  isCliModel,
  isWebModel,
} from "../utils/model-utils-v2.js";

export class ModelService {
  public getAvailableModelsV2(): ModelConfig[] {
    return modelRegistry.getAll();
  }

  public getApiModelsV2(): ApiModelConfigV2[] {
    return modelRegistry
      .getAll()
      .filter((m): m is ApiModelConfigV2 => isApiModel(m.modelId));
  }

  public getCliModelsV2(): CliModelConfig[] {
    return modelRegistry
      .getAll()
      .filter((m): m is CliModelConfig => isCliModel(m.modelId));
  }

  public getWebModelsV2(): WebModelConfig[] {
    return modelRegistry
      .getAll()
      .filter((m): m is WebModelConfig => isWebModel(m.modelId));
  }

  public isModelEnabledV2(modelId: string): boolean {
    return modelRegistry.get(modelId as any)?.enabled ?? false;
  }
}

export function createModelService(): ModelService {
  return new ModelService();
}
