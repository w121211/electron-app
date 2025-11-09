// src/core/utils/model-utils-v2.ts
import type { ModelSurfaceV2 } from "../services/chat/chat-session-repository.js";

/**
 * Model ID Format:
 * - Simple: <surface>:<provider>
 *   Examples: terminal:claude, web:chatgpt
 *
 * - Extended: <surface>:<provider>:<model-id>
 *   Examples: api:openrouter:google/gemini-2.5-flash-preview-09-2025
 *
 * Surface types: api, terminal, web
 */

// ============================================================================
// Core Types
// ============================================================================

// Base model ID format - must contain at least 1 colon
export type ModelId = `${ModelSurfaceV2}:${string}`;

// Specific surface model IDs
export type ApiModelId = `api:${string}`;
export type CliModelId = `cli:${string}`;
export type WebModelId = `web:${string}`;

// Parsed model ID components
export interface ParsedModelId {
  surface: ModelSurfaceV2;
  provider: string;
  providerModelId: string; // For simple format, equals provider
  raw: ModelId;
}

// ============================================================================
// Model Configuration Types
// ============================================================================

export interface ApiModelConfig {
  modelId: ApiModelId;
  enabled: boolean;
  displayName?: string;
  description?: string;
}

export interface CliModelConfig {
  modelId: CliModelId;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  displayName?: string;
  description?: string;
}

export interface WebModelConfig {
  modelId: WebModelId;
  url: string;
  windowTitle?: string;
  enabled: boolean;
  displayName?: string;
  description?: string;
}

export type ModelConfig = ApiModelConfig | CliModelConfig | WebModelConfig;

// ============================================================================
// Parsing and Validation Functions
// ============================================================================

export function parseModelId(modelId: string): ParsedModelId {
  const parts = modelId.split(":");

  if (parts.length < 2) {
    throw new Error(
      `Invalid model ID format: "${modelId}". Expected format: <surface>:<provider> or <surface>:<provider>:<model-id>`,
    );
  }

  const [surface, provider, ...modelParts] = parts;

  const validSurfaces: ModelSurfaceV2[] = ["api", "cli", "web", "pty"];
  if (!validSurfaces.includes(surface as ModelSurfaceV2)) {
    throw new Error(
      `Invalid surface: "${surface}". Must be one of: api, cli, web, pty`,
    );
  }

  if (!provider) {
    throw new Error(`Invalid model ID: "${modelId}". Provider cannot be empty`);
  }

  // If no model parts, use provider as the model ID (simple format)
  // Otherwise, join model parts (extended format, handles colons in model ID)
  const providerModelId =
    modelParts.length > 0 ? modelParts.join(":") : provider;

  return {
    surface: surface as ModelSurfaceV2,
    provider,
    providerModelId,
    raw: modelId as ModelId,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isApiModel(modelId: string): modelId is ApiModelId {
  return modelId.startsWith("api:");
}

export function isCliModel(modelId: string): modelId is CliModelId {
  return modelId.startsWith("cli:");
}

export function isWebModel(modelId: string): modelId is WebModelId {
  return modelId.startsWith("web:");
}

export function isWebModelConfig(
  config: ModelConfig,
): config is WebModelConfig {
  return isWebModel(config.modelId);
}

export function isApiModelConfig(
  config: ModelConfig,
): config is ApiModelConfig {
  return isApiModel(config.modelId);
}

export function isCliModelConfig(
  config: ModelConfig,
): config is CliModelConfig {
  return isCliModel(config.modelId);
}

// ============================================================================
// Preset Models
// ============================================================================

export const presetApiModels: Record<string, ApiModelConfig> = {
  "api:aigateway:gemini-2.0-flash-exp": {
    modelId: "api:aigateway:gemini-2.0-flash-exp",
    enabled: false,
    displayName: "Gemini 2.0 Flash (AI Gateway)",
  },
  "api:openrouter:google/gemini-2.5-flash-preview-09-2025": {
    modelId: "api:openrouter:google/gemini-2.5-flash-preview-09-2025",
    enabled: false,
    displayName: "Gemini 2.5 Flash (OpenRouter)",
  },
  "api:aigateway:anthropic/claude-haiku-4.5": {
    modelId: "api:aigateway:anthropic/claude-haiku-4.5",
    enabled: false,
    displayName: "Claude Haiku 4.5",
  },
};

export const presetCliModels: Record<string, CliModelConfig> = {
  "cli:claude": {
    modelId: "cli:claude",
    command: "claude",
    args: [],
    enabled: true,
    displayName: "Claude CLI",
  },
  "cli:gemini": {
    modelId: "cli:gemini",
    command: "gemini",
    args: [],
    enabled: true,
    displayName: "Gemini CLI",
  },
  "cli:codex": {
    modelId: "cli:codex",
    command: "codex",
    args: [],
    enabled: true,
    displayName: "Codex CLI",
  },
  "cli:debug": {
    modelId: "cli:debug",
    command: "",
    args: [],
    enabled: true,
    displayName: "Debug CLI",
  },
};

export const presetWebModels: Record<string, WebModelConfig> = {
  "web:chatgpt": {
    modelId: "web:chatgpt",
    url: "https://chatgpt.com/",
    windowTitle: "ChatGPT",
    enabled: true,
    displayName: "ChatGPT",
  },
  "web:claude": {
    modelId: "web:claude",
    url: "https://claude.ai/chat",
    windowTitle: "Claude",
    enabled: true,
    displayName: "Claude",
  },
};

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry {
  models: Map<ModelId, ModelConfig>;

  constructor() {
    this.models = new Map();
    this.loadPresets();
  }

  private loadPresets(): void {
    Object.values(presetApiModels).forEach((model) => {
      this.models.set(model.modelId, model);
    });

    Object.values(presetCliModels).forEach((model) => {
      this.models.set(model.modelId, model);
    });

    Object.values(presetWebModels).forEach((model) => {
      this.models.set(model.modelId, model);
    });
  }

  get(modelId: ModelId): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  register(config: ModelConfig): void {
    this.models.set(config.modelId, config);
  }

  unregister(modelId: ModelId): void {
    this.models.delete(modelId);
  }

  has(modelId: ModelId): boolean {
    return this.models.has(modelId);
  }

  getAll(): ModelConfig[] {
    return Array.from(this.models.values());
  }
}

// Singleton instance
export const modelRegistry = new ModelRegistry();
