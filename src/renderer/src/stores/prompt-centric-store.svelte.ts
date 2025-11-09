// src/renderer/src/stores/prompt-centric-store.svelte.ts

import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import type { ModelSurface } from "../../core/utils/model-utils-v2.js";
import type {
  PromptScriptEngine,
  PromptScriptWarning,
} from "../../../core/services/prompt-script/prompt-script-repository.js";

export type PromptStatusFilter =
  | "all"
  | "active"
  | "queued"
  | "terminated"
  | "draft"
  | "web"
  | "cli";

export interface PromptListEntry {
  editId: string;
  kind: "draft" | "script";
  title: string;
  updatedAt: Date;
  preview: string | null;
  scriptPath: string | null;
  relativePath: string | null;
  contentDraft: string | null;
  chatSession: ChatSessionData | null;
  projectPath: string | null;
  modelId: string | null;
  modelSurface: ModelSurface | null;
  metadataEngine: PromptScriptEngine | null;
  warnings: PromptScriptWarning[] | null;
}

interface PromptCentricState {
  entries: PromptListEntry[];
  filter: PromptStatusFilter;
  selectedEditId: string | null;
  isLoading: boolean;
}

export const promptCentricState = $state<PromptCentricState>({
  entries: [],
  filter: "all",
  selectedEditId: null,
  isLoading: false,
});

export function setPromptEntries(entries: PromptListEntry[]): void {
  promptCentricState.entries = entries;

  if (entries.length === 0) {
    promptCentricState.selectedEditId = null;
    return;
  }

  const selectedExists = entries.some(
    (entry) => entry.editId === promptCentricState.selectedEditId,
  );

  if (!selectedExists) {
    promptCentricState.selectedEditId = entries[0]?.editId ?? null;
  }
}

export function setPromptLoading(isLoading: boolean): void {
  promptCentricState.isLoading = isLoading;
}

export function setPromptFilter(filter: PromptStatusFilter): void {
  promptCentricState.filter = filter;
}

export function selectPrompt(editId: string | null): void {
  promptCentricState.selectedEditId = editId;
}

export function getSelectedPrompt(): PromptListEntry | null {
  if (!promptCentricState.selectedEditId) {
    return null;
  }

  return (
    promptCentricState.entries.find(
      (entry) => entry.editId === promptCentricState.selectedEditId,
    ) ?? null
  );
}

export function updatePromptEntry(
  editId: string,
  updater: (current: PromptListEntry) => PromptListEntry,
): void {
  const index = promptCentricState.entries.findIndex(
    (entry) => entry.editId === editId,
  );

  if (index === -1) {
    return;
  }

  const current = promptCentricState.entries[index];
  const updated = updater(current);

  promptCentricState.entries = [
    ...promptCentricState.entries.slice(0, index),
    updated,
    ...promptCentricState.entries.slice(index + 1),
  ];
}
