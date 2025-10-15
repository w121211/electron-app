// src/renderer/src/stores/documents.svelte.ts
import type { DocumentFileWithPromptScript } from "../../../core/services/document/document-service.js";
import type { PromptScriptLinkResult } from "../../../core/services/prompt-script/prompt-script-repository.js";

// Frontend-normalized version: replaces chatSession with chatSessionId for single source of truth
export interface PromptScriptLinkFrontend
  extends Omit<PromptScriptLinkResult, "chatSession"> {
  chatSession: undefined;
  chatSessionId: string | null;
}

// Frontend-normalized version: uses PromptScriptLinkFrontend instead of PromptScriptLinkResult
export interface DocumentFileWithPromptScriptFrontend
  extends Omit<DocumentFileWithPromptScript, "promptScriptLink"> {
  promptScriptLink: PromptScriptLinkFrontend | null;
}

export interface DocumentState {
  data: DocumentFileWithPromptScriptFrontend; // Isolates backend data in `data` and keeps frontend state at the top level.
  lastOpenedAt: string;
}

export const documents: Record<string, DocumentState> = $state({});

export const getDocumentList = () => Object.values(documents);

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.data.kind === "promptScript");
