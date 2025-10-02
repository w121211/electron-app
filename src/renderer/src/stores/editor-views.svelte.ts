// src/renderer/src/stores/editor-views.svelte.ts

import { SvelteMap } from "svelte/reactivity";

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

export const editorViews = new SvelteMap<string, EditorViewState>();

export const getOpenEditorViews = () => [...editorViews.values()];

export const getFocusedEditorView = () =>
  getOpenEditorViews().find((view) => view.isFocused) ?? null;