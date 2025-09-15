// src/core/utils/model-utils.ts

export interface ExternalModel {
  modelId: `${string}/${string}`;
  command: string;
  args: string[];
  enabled: boolean;
}

export interface InternalModel {
  modelId: `${string}/${string}`;
  provider: string;
  enabled: boolean;
}

export interface AvailableModels {
  external: Record<string, ExternalModel>;
  internal: Record<string, InternalModel>;
}

export function isTerminalModel(modelId: string): boolean {
  return modelId.startsWith("cli/");
}

export const presetExternalModels: Record<string, ExternalModel> = {
  "cli/claude": {
    modelId: "cli/claude",
    command: "claude",
    args: [],
    enabled: true,
  },
  "cli/gemini": {
    modelId: "cli/gemini",
    command: "gemini",
    args: [],
    enabled: true,
  },
  "cli/codex": {
    modelId: "cli/codex",
    command: "codex",
    args: [],
    enabled: true,
  },
};

export const presetInternalModels: Record<string, InternalModel> = {
  "openai/gpt-4o": {
    provider: "openai",
    modelId: "openai/gpt-4o",
    enabled: false,
  },
  "anthropic/claude-3-sonnet": {
    provider: "anthropic",
    modelId: "anthropic/claude-3-sonnet",
    enabled: false,
  },
  "google/gemini-pro": {
    provider: "google",
    modelId: "google/gemini-pro",
    enabled: false,
  },
};
