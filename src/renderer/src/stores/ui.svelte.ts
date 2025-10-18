// src/renderer/src/stores/ui.svelte.ts

import { documents } from "./documents.svelte.js";
import { editorViews } from "./editor-views.svelte.js";
import { chatSessions } from "./chat.svelte.js";

export interface UiState {
  openFilePaths: string[];
  activeFilePath: string | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  previewPaneOpen: boolean;
  promptEditorOpen: boolean;
  // promptConsoleOpen: boolean;
}

export const ui = $state<UiState>({
  openFilePaths: [],
  activeFilePath: null,
  leftPanelOpen: true,
  rightPanelOpen: false,
  previewPaneOpen: false,
  promptEditorOpen: false,
  // promptConsoleOpen: false,
});

export const isDirty = (filePath: string, inputValue: string) => {
  const doc = documents[filePath] ?? null;
  if (doc && inputValue) {
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
  const chatSessionState = documentState?.data.promptScriptLink?.chatSessionId
    ? chatSessions[documentState.data.promptScriptLink.chatSessionId]
    : null;

  return {
    filePath: ui.activeFilePath,
    documentState,
    editorViewState,
    chatSessionState,
    isDirty: isDirty(ui.activeFilePath, editorViewState?.unsavedContent ?? ""),
  };
};

export const getChatSessionByPromptScriptPath = (filePath: string) => {
  const documentState = documents[filePath] ?? null;
  if (!documentState?.data.promptScriptLink?.chatSessionId) {
    return null;
  }
  return chatSessions[documentState.data.promptScriptLink.chatSessionId] ?? null;
};
