// src/renderer/src/stores/documents.svelte.ts
import type { CoreDocument } from "../../../core/services/document/document-service.js";
import type { PromptScriptLinkResult } from "../../../core/services/prompt-script/prompt-script-service.js";

export interface PromptScriptState {
  link: PromptScriptLinkResult | null;
  lastReconciledAt: string | null;
}

export interface DocumentState {
  data: CoreDocument; // Isolates backend data in `data` and keeps frontend state at the top level.
  lastOpenedAt: string;
  promptScript: PromptScriptState | null;
}

export const documents: Record<string, DocumentState> = $state({});

export const getDocumentList = () => Object.values(documents);

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.data.kind === "promptScript");
