// src/renderer/src/stores/file-search-store.svelte.ts
import type { ProjectFileSearchResult } from "../../../core/services/project-folder-service.js";

interface FileSearchState {
  results: ProjectFileSearchResult[];
  selectedIndex: number;
  showMenu: boolean;
  isSearching: boolean;
  searchQuery: string;
  cursorPosition: number;
  searchStartPosition: number;
}

// Unified state object
export const fileSearchState = $state<FileSearchState>({
  results: [],
  selectedIndex: -1,
  showMenu: false,
  isSearching: false,
  searchQuery: "",
  cursorPosition: -1,
  searchStartPosition: -1,
});

// Mutation functions
export function setSearchResults(results: ProjectFileSearchResult[]) {
  fileSearchState.results = results;
  fileSearchState.selectedIndex = results.length > 0 ? 0 : -1;
}

export function setSelectedIndex(index: number) {
  if (index >= 0 && index < fileSearchState.results.length) {
    fileSearchState.selectedIndex = index;
  }
}

export function setShowMenu(show: boolean) {
  fileSearchState.showMenu = show;
  if (!show) {
    fileSearchState.selectedIndex = -1;
    fileSearchState.results = [];
    fileSearchState.searchQuery = "";
    fileSearchState.isSearching = false;
  }
}

export function setSearching(searching: boolean) {
  fileSearchState.isSearching = searching;
}

export function setSearchQuery(query: string) {
  fileSearchState.searchQuery = query;
}

export function setCursorPosition(position: number) {
  fileSearchState.cursorPosition = position;
}

export function setSearchStartPosition(position: number) {
  fileSearchState.searchStartPosition = position;
}

export function moveSelectionUp() {
  if (fileSearchState.selectedIndex > 0) {
    fileSearchState.selectedIndex--;
  }
}

export function moveSelectionDown() {
  if (fileSearchState.selectedIndex < fileSearchState.results.length - 1) {
    fileSearchState.selectedIndex++;
  }
}

export function resetSearch() {
  fileSearchState.results = [];
  fileSearchState.selectedIndex = -1;
  fileSearchState.showMenu = false;
  fileSearchState.isSearching = false;
  fileSearchState.searchQuery = "";
  fileSearchState.cursorPosition = -1;
  fileSearchState.searchStartPosition = -1;
}
