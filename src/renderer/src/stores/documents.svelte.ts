// src/renderer/src/stores/documents.svelte.ts
import type { DocumentFile } from "../../../core/services/document/document-service.js";

export interface DocumentState {
  data: DocumentFile; // Isolates backend data in `data` and keeps frontend state at the top level.
  lastOpenedAt: string;
  // promptScript: PromptScriptState | null;
}

export const documents: Record<string, DocumentState> = $state({});

export const getDocumentList = () => Object.values(documents);

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.data.kind === "promptScript");
