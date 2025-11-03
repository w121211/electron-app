// src/renderer/src/stores/inbox-store.svelte.ts
import type { InboxEntry } from "../services/inbox-service.js";
import { getEntryId } from "../services/inbox-service.js";

export type InboxFilter =
  | "all"
  | "active"
  | "terminated"
  | "queued"
  | "prompt"
  | "web"
  | "cli";

interface InboxContextMenu {
  isVisible: boolean;
  x: number;
  y: number;
  targetEntryId: string | null;
  isPrompt: boolean;
}

interface InboxState {
  entries: InboxEntry[];
  filter: InboxFilter;
  selectedId: string | null;
  isLoading: boolean;
  contextMenu: InboxContextMenu;
}

export const inboxState = $state<InboxState>({
  entries: [],
  filter: "all",
  selectedId: null,
  isLoading: false,
  contextMenu: {
    isVisible: false,
    x: 0,
    y: 0,
    targetEntryId: null,
    isPrompt: false,
  },
});

export function setInboxEntries(entries: InboxEntry[]): void {
  inboxState.entries = entries;
}

export function setInboxFilter(filter: InboxFilter): void {
  inboxState.filter = filter;
}

export function selectInboxEntry(id: string | null): void {
  inboxState.selectedId = id;
}

export function setInboxLoading(isLoading: boolean): void {
  inboxState.isLoading = isLoading;
}

export function getSelectedInboxEntry(): InboxEntry | null {
  if (!inboxState.selectedId) {
    return null;
  }
  return (
    inboxState.entries.find(
      (entry) => getEntryId(entry) === inboxState.selectedId,
    ) ?? null
  );
}

export function updateInboxEntry(
  id: string,
  updater: (entry: InboxEntry) => InboxEntry,
): void {
  const index = inboxState.entries.findIndex(
    (entry) => getEntryId(entry) === id,
  );
  if (index !== -1) {
    inboxState.entries[index] = updater(inboxState.entries[index]);
  }
}

export function removeInboxEntry(id: string): void {
  inboxState.entries = inboxState.entries.filter(
    (entry) => getEntryId(entry) !== id,
  );
  if (inboxState.selectedId === id) {
    inboxState.selectedId = null;
  }
}

export function showInboxContextMenu(
  x: number,
  y: number,
  targetEntryId: string,
  isPrompt: boolean,
): void {
  const menuWidth = 200;
  const menuHeight = 100;
  const finalX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const finalY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  inboxState.contextMenu.isVisible = true;
  inboxState.contextMenu.x = finalX;
  inboxState.contextMenu.y = finalY;
  inboxState.contextMenu.targetEntryId = targetEntryId;
  inboxState.contextMenu.isPrompt = isPrompt;
}

export function hideInboxContextMenu(): void {
  inboxState.contextMenu.isVisible = false;
  inboxState.contextMenu.targetEntryId = null;
}
