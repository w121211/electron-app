// src/core/utils/model-utils.ts

export interface ExternalModel {
  modelId: `${string}/${string}`;
  command?: string;
  args?: string[];
  enabled: boolean;
  url?: string;
  windowTitle?: string;
}

export interface ApiModelConfig {
  modelId: `api/${string}:${string}`;
  enabled: boolean;
  displayName?: string;
}

export interface AvailableModels {
  external: Record<string, ExternalModel>;
  api: Record<string, ApiModelConfig>;
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

export interface ParsedApiModelId {
  surface: string;
  provider: string;
  modelIdForProvider: string;
}

export function parseApiModelId(modelId: string): ParsedApiModelId {
  const firstSlashIndex = modelId.indexOf("/");
  if (firstSlashIndex === -1) {
    throw new Error(`Invalid modelId format: ${modelId}`);
  }

  const surface = modelId.substring(0, firstSlashIndex);
  if (surface !== "api") {
    throw new Error(`Invalid modelId format: ${modelId}`);
  }

  const rest = modelId.substring(firstSlashIndex + 1);
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid modelId format: ${modelId} (missing colon separator)`);
  }

  const provider = rest.substring(0, colonIndex);
  const modelIdForProvider = rest.substring(colonIndex + 1);

  return {
    surface,
    provider,
    modelIdForProvider,
  };
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

export const presetApiModels: Record<string, ApiModelConfig> = {
  "api/openai:gpt-4o": {
    modelId: "api/openai:gpt-4o",
    enabled: false,
  },
  "api/anthropic:claude-3-5-sonnet": {
    modelId: "api/anthropic:claude-3-5-sonnet",
    enabled: false,
    displayName: "Claude 3.5 Sonnet",
  },
  "api/ai-gateway:gemini-2.0-flash-exp": {
    modelId: "api/ai-gateway:gemini-2.0-flash-exp",
    enabled: false,
  },
  "api/openrouter:google/gemini-2.5-flash-preview-09-2025": {
    modelId: "api/openrouter:google/gemini-2.5-flash-preview-09-2025",
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
