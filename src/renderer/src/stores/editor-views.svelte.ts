// src/renderer/src/stores/editor-views.svelte.ts

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  anchor: CursorPosition;
  head: CursorPosition;
}

export interface EditorViewState {
  filePath: string;
  unsavedContent: string;
  cursor: CursorPosition | null;
  selections: SelectionRange[];
  scrollTop: number;
  scrollLeft: number;
  isFocused: boolean;
  languageId: string | null;
  lastInteractionAt: string | null;
}

export const editorViews = $state({} as Record<string, EditorViewState>);

export const getOpenEditorViews = () => Object.values(editorViews);

export const getFocusedEditorView = () =>
  getOpenEditorViews().find((view) => view.isFocused) ?? null;