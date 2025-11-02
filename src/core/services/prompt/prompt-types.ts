// src/core/services/prompt/prompt-types.ts
export interface PromptMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  variables?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Prompt {
  id: string;
  slug: string | null;
  content: string;
  metadata: PromptMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptSnapshot {
  promptId: string;
  slug: string | null;
  content: string;
  metadata: PromptMetadata | null;
  capturedAt: string;
  args?: Record<string, unknown>;
}

export interface PromptSeedResult {
  created: number;
  updated: number;
  skipped: number;
}
