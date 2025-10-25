// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";
import {
  type ExternalModel,
  type ApiModelConfig,
  type AvailableModels,
  presetExternalModels,
  presetApiModels,
} from '../utils/model-utils.js';

export class ModelService {
  // @ts-expect-error - Intentionally unused for future use
  private readonly _logger: Logger<ILogObj>;

  constructor() {
    this._logger = new Logger({ name: "ModelService" });
  }

  public async getAvailableModels(): Promise<AvailableModels> {
    return {
      external: presetExternalModels,
      api: presetApiModels,
    };
  }

  public getExternalModels(): Record<string, ExternalModel> {
    return presetExternalModels;
  }

  public getApiModels(): Record<string, ApiModelConfig> {
    return presetApiModels;
  }

  public isExternalModelEnabled(modelId: string): boolean {
    return presetExternalModels[modelId]?.enabled ?? false;
  }

  public isApiModelEnabled(modelId: string): boolean {
    return presetApiModels[modelId]?.enabled ?? false;
  }
}

export function createModelService(): ModelService {
  return new ModelService();
}
