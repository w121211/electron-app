// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";
import {
  type ExternalModel,
  type ApiModelConfig,
  type AvailableModels,
  presetExternalModels,
  presetApiModels,
} from "../../core/utils/model-utils-v2.js';
import {
  modelRegistry,
  type ModelConfig,
  type ApiModelConfig as ApiModelConfigV2,
  type CliModelConfig,
  type WebModelConfig,
  isApiModel,
  isCliModel,
  isWebModel,
} from '../utils/model-utils-v2.js';

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

  // V2 Methods
  public getAvailableModelsV2(): ModelConfig[] {
    return modelRegistry.getAll();
  }

  public getApiModelsV2(): ApiModelConfigV2[] {
    return modelRegistry.getAll().filter((m): m is ApiModelConfigV2 => isApiModel(m.modelId));
  }

  public getCliModelsV2(): CliModelConfig[] {
    return modelRegistry.getAll().filter((m): m is CliModelConfig => isCliModel(m.modelId));
  }

  public getWebModelsV2(): WebModelConfig[] {
    return modelRegistry.getAll().filter((m): m is WebModelConfig => isWebModel(m.modelId));
  }

  public isModelEnabledV2(modelId: string): boolean {
    return modelRegistry.get(modelId as any)?.enabled ?? false;
  }
}

export function createModelService(): ModelService {
  return new ModelService();
}
