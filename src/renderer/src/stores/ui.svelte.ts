// src/renderer/src/stores/ui.svelte.ts

import type { DocumentState } from "./documents.svelte.js";
import { documents } from "./documents.svelte.js";
import { editorViews } from "./editor-views.svelte.js";
import { chatSessions, chatSessionLinks } from "./chat.svelte.js";

export interface UiState {
  openFilePaths: string[];
  activeFilePath: string | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  promptConsoleOpen: boolean;
  previewPaneOpen: boolean;
}

export const ui = $state<UiState>({
  openFilePaths: [],
  activeFilePath: null,
  leftPanelOpen: true,
  rightPanelOpen: false,
  promptConsoleOpen: false,
  previewPaneOpen: false,
});

const isDocument = (
  value: DocumentState | null | undefined,
): value is DocumentState => {
  return value !== null && value !== undefined;
};

// export const getOpenDocuments = () => $derived(
//   ui.openFilePaths
//     .map((filePath) => documents.get(filePath) ?? null)
//     .filter(isDocument),
// );

export const isDirty = (filePath: string, inputValue: string) => {
  const doc = documents[filePath] ?? null;
  if (doc) {
    return doc.data.content !== inputValue;
  }
  return false;
};

export const getSelectedDocContext = () => {
  if (!ui.activeFilePath) {
    return null;
  }

  const documentState = documents[ui.activeFilePath] ?? null;
  const editorViewState = editorViews[ui.activeFilePath] ?? null;
  const sessionLink = chatSessionLinks.get(ui.activeFilePath) ?? null;
  const chatSessionState = sessionLink?.sessionId
    ? (chatSessions.get(sessionLink.sessionId) ?? null)
    : null;

  return {
    filePath: ui.activeFilePath,
    documentState,
    editorViewState,
    // sessionLink,
    chatSessionState,
    isDirty: isDirty(ui.activeFilePath, editorViewState?.unsavedContent ?? ""),
  };
};

// export const getActivePromptMetadata = () => {
//   const doc = getActiveDocument();
//   if (!doc || doc.kind !== "promptScript") {
//     return null;
//   }

//   return {
//     metadata: doc.promptScript?.metadata ?? null,
//     link: doc.promptScript?.link ?? null,
//     session: getActiveChatSession(),
//   };
// };

// export const getHasPromptDriftWarnings = () => {
//   const session = getActiveChatSession();
//   if (!session) {
//     return false;
//   }

//   return session.driftWarnings.some(
//     (warning) => warning.severity === "warning" || warning.severity === "error",
//   );
// };
