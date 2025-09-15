// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";
import {
  type ExternalModel,
  type InternalModel,
  type AvailableModels,
  presetExternalModels,
  presetInternalModels,
} from "../utils/model-utils.js";

export class ModelService {
  private readonly logger: Logger<ILogObj>;

  constructor() {
    this.logger = new Logger({ name: "ModelService" });
  }

  public async getAvailableModels(): Promise<AvailableModels> {
    this.logger.info("Getting available models");

    return {
      external: presetExternalModels,
      internal: presetInternalModels,
    };
  }

  public getExternalModels(): Record<string, ExternalModel> {
    return presetExternalModels;
  }

  public getInternalModels(): Record<string, InternalModel> {
    return presetInternalModels;
  }

  public isExternalModelEnabled(modelId: string): boolean {
    return presetExternalModels[modelId]?.enabled ?? false;
  }

  public isInternalModelEnabled(modelId: string): boolean {
    return presetInternalModels[modelId]?.enabled ?? false;
  }
}

export function createModelService(): ModelService {
  return new ModelService();
}
