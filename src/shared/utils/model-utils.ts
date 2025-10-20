// src/shared/utils/model-utils.ts

export interface ExternalModel {
  modelId: `${string}/${string}`;
  command?: string;
  args?: string[];
  enabled: boolean;
  url?: string;
  windowTitle?: string;
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

export type ModelSurface = "api" | "terminal" | "web" | "pty";

export function getModelSurface(modelId: string): ModelSurface {
  if (modelId.startsWith("cli/")) {
    return "terminal";
  }

  if (modelId.startsWith("web/")) {
    return "web";
  }

  return "api";
}

export function isTerminalModel(modelId: string): boolean {
  return getModelSurface(modelId) === "terminal";
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
  "cli/debug": {
    modelId: "cli/debug",
    command: "",
    args: [],
    enabled: true,
  },
  "web/chatgpt": {
    modelId: "web/chatgpt",
    enabled: true,
    url: "https://chatgpt.com/",
    windowTitle: "ChatGPT",
  },
  "web/claude": {
    modelId: "web/claude",
    enabled: true,
    url: "https://claude.ai/chat",
    windowTitle: "Claude",
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

export function buildCliModelCommand(
  modelId: `${string}/${string}`,
  _prompt: string,
): string {
  const model = presetExternalModels[modelId];
  if (!model) {
    throw new Error(`Unknown external model: ${modelId}`);
  }

  const command = model.command;
  if (!command || command.trim().length === 0) {
    throw new Error(`No command configured for external model: ${modelId}`);
  }
  // const args = model.args.join(" ");
  // const fullCommand = args ? `${command} ${args}` : command;

  // return `${fullCommand} "${prompt.replace(/"/g, '\\"')}"`;
  // return `${fullCommand}`;
  return command;
}

export function getWebModelUrl(modelId: string): string | null {
  const model = presetExternalModels[modelId];
  if (!model?.url) {
    return null;
  }
  return model.url;
}

export function getWebModelWindowTitle(modelId: string): string | null {
  const model = presetExternalModels[modelId];
  if (!model?.windowTitle) {
    return null;
  }
  return model.windowTitle;
}
