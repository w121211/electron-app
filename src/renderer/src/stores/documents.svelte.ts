// src/renderer/src/stores/documents.svelte.ts
import type { DocumentFileWithPromptScript } from "../../../core/services/document/document-service.js";

export interface DocumentState {
  data: DocumentFileWithPromptScript; // Isolates backend data in `data` and keeps frontend state at the top level.
  lastOpenedAt: string;
}

export const documents: Record<string, DocumentState> = $state({});

export const getDocumentList = () => Object.values(documents);

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.data.kind === "promptScript");
