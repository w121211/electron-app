// src/core/utils/model-utils.ts

export function isTerminalModel(modelId: string): boolean {
  const terminalModels = [
    "terminal/claude-code",
    "terminal/gemini-cli",
    "terminal/codex",
    "terminal/cursor",
    "terminal/vscode",
  ];
  return terminalModels.includes(modelId);
}

export const TERMINAL_MODELS = [
  "terminal/claude-code",
  "terminal/gemini-cli",
  "terminal/codex",
  "terminal/cursor",
  "terminal/vscode",
] as const;

export type TerminalModelId = (typeof TERMINAL_MODELS)[number];
