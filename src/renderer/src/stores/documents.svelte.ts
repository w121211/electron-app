// src/renderer/src/stores/documents.ts

import {
  type PromptScriptMetadata,
  type PromptScriptPrompt,
} from "../../../core/services/prompt-script/prompt-script-parser.js";

export type DocumentKind =
  | "promptScript"
  | "markdown"
  | "code"
  | "json"
  | "text"
  | "binary";

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
  metadata: PromptScriptMetadata;
  prompts: PromptScriptPrompt[];
  delimiter: string;
  link: PromptScriptLink | null;
  lastReconciledAt: string | null;
  body: string;
  warnings: string[];
}

export interface DocumentMetadata {
  fileName: string;
  extension: string;
  charset: string;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface DocumentState {
  filePath: string;
  kind: DocumentKind;
  savedContent: string;
  savedHash: string;
  metadata: DocumentMetadata;
  promptScript: PromptScriptState | null;
  lastOpenedAt: string;
}

export const documents = $state(new Map<string, DocumentState>());

export const getDocumentList = () => [...documents.values()];

export const getPromptScriptDocuments = () =>
  getDocumentList().filter((document) => document.kind === "promptScript");
