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

export const getActiveEditorContext = () => {
  if (!ui.activeFilePath) {
    return null;
  }

  const documentState = documents.get(ui.activeFilePath) ?? null;
  const editorViewState = editorViews.get(ui.activeFilePath) ?? null;
  const sessionLink = chatSessionLinks.get(ui.activeFilePath) ?? null;
  const chatSessionState = sessionLink?.sessionId
    ? (chatSessions.get(sessionLink.sessionId) ?? null)
    : null;
  const isDirty =
    documentState && editorViewState
      ? documentState.savedContent !== editorViewState.unsavedContent
      : false;

  return {
    filePath: ui.activeFilePath,
    documentState,
    editorViewState,
    // sessionLink,
    chatSessionState,
    isDirty,
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
