// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";
import {
  type ExternalModel,
  type InternalModel,
  type AvailableModels,
  presetExternalModels,
  presetInternalModels,
} from "../../shared/utils/model-utils.js";

export class ModelService {
  // @ts-expect-error - Intentionally unused for future use
  private readonly _logger: Logger<ILogObj>;

  constructor() {
    this._logger = new Logger({ name: "ModelService" });
  }

  public async getAvailableModels(): Promise<AvailableModels> {
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
