// src/renderer/src/stores/documents.svelte.ts
import type { CoreDocument } from "../../../core/services/document/document-service.js";

export type PromptScriptDriftStatus =
  | "none"
  | "content_changed"
  | "session_missing"
  | "hash_mismatch";

export interface PromptScriptLink {
  sessionId: string | null;
  scriptHash: string | null;
  status: PromptScriptDriftStatus;
  warnings: string[];
  resolvedAt: string;
}

export interface PromptScriptState {
  link: PromptScriptLink | null;
  lastReconciledAt: string | null;
}

export interface DocumentState {
  data: CoreDocument; // Isolates backend data in `data` and keeps frontend state at the top level.
  lastOpenedAt: string;
  promptScript: PromptScriptState | null;
}

export const documents = $state(new Map<string, DocumentState>());

export const getDocumentList = () => [...documents.values()];

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.data.kind === "promptScript");
