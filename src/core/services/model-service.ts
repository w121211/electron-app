// src/core/services/model-service.ts
import { Logger, type ILogObj } from "tslog";

export interface ExternalModel {
  command: string;
  args: string[];
  enabled: boolean;
}

export interface InternalModel {
  provider: string;
  modelId: string;
  enabled: boolean;
}

export interface AvailableModels {
  external: Record<string, ExternalModel>;
  internal: Record<string, InternalModel>;
}

const presetExternalModels: Record<string, ExternalModel> = {
  "terminal/claude-code": { command: "claude", args: [], enabled: true },
  "terminal/gemini-cli": { command: "gemini", args: [], enabled: true },
  "terminal/codex": { command: "codex", args: [], enabled: true },
  "terminal/cursor": { command: "cursor", args: ["."], enabled: false },
  "terminal/vscode": { command: "code", args: ["."], enabled: false },
};

const presetInternalModels: Record<string, InternalModel> = {
  "openai/gpt-4o": { provider: "openai", modelId: "gpt-4o", enabled: false },
  "anthropic/claude-3-sonnet": { provider: "anthropic", modelId: "claude-3-sonnet", enabled: false },
  "google/gemini-pro": { provider: "google", modelId: "gemini-pro", enabled: false },
};

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