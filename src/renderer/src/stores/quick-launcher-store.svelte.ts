// src/renderer/src/stores/quick-launcher-store.svelte.ts
import type { ProjectFileSearchResult } from "../../../core/services/project-folder-service.js";

export interface ChatSearchResult {
  id: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  lastModified: Date;
  highlightTokens: Array<{
    text: string;
    isHighlighted: boolean;
  }>;
}

export interface QuickLauncherResult {
  type: "chat" | "file";
  data: ChatSearchResult | ProjectFileSearchResult;
}

interface QuickLauncherState {
  searchQuery: string;
  selectedIndex: number;
  results: QuickLauncherResult[];
  recentChats: ChatSearchResult[];
  isLoading: boolean;
}

// State object
export const quickLauncherState = $state<QuickLauncherState>({
  searchQuery: "",
  selectedIndex: 0,
  results: [],
  recentChats: [],
  isLoading: false,
});

// Derived values - export functions that return derived values
export function getFilteredResults() {
  if (quickLauncherState.searchQuery.trim() === "") {
    // Show recent chats when no search query
    return quickLauncherState.recentChats.map((chat) => ({
      type: "chat" as const,
      data: chat,
    }));
  }
  return quickLauncherState.results;
}

export function getTotalResults() {
  return getFilteredResults().length;
}

// Action functions
export function resetQuickLauncher() {
  quickLauncherState.searchQuery = "";
  quickLauncherState.selectedIndex = 0;
  quickLauncherState.results = [];
}

export function setSearchQuery(query: string) {
  quickLauncherState.searchQuery = query;
  quickLauncherState.selectedIndex = 0; // Reset selection when query changes
}

export function setResults(results: QuickLauncherResult[]) {
  quickLauncherState.results = results;
  quickLauncherState.selectedIndex = 0;
}

export function setRecentChats(chats: ChatSearchResult[]) {
  quickLauncherState.recentChats = chats;
}

export function setLoading(loading: boolean) {
  quickLauncherState.isLoading = loading;
}

export function moveSelectionUp() {
  quickLauncherState.selectedIndex = Math.max(
    0,
    quickLauncherState.selectedIndex - 1,
  );
}

export function moveSelectionDown() {
  quickLauncherState.selectedIndex = Math.min(
    getTotalResults() - 1,
    quickLauncherState.selectedIndex + 1,
  );
}

export function setSelectedIndex(index: number) {
  quickLauncherState.selectedIndex = Math.max(
    0,
    Math.min(getTotalResults() - 1, index),
  );
}

export function getSelectedResult(): QuickLauncherResult | null {
  const results = getFilteredResults();
  if (
    quickLauncherState.selectedIndex >= 0 &&
    quickLauncherState.selectedIndex < results.length
  ) {
    return results[quickLauncherState.selectedIndex];
  }
  return null;
}
