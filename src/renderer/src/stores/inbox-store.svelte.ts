// src/renderer/src/stores/inbox-store.svelte.ts
import type { InboxEntry } from "../services/inbox-service.js";
import { getEntryId, fetchInboxEntries } from "../services/inbox-service.js";
import { Logger } from "tslog";

const logger = new Logger({ name: "InboxStore" });

export type InboxFilter =
  | "all"
  | "active"
  | "terminated"
  | "queued"
  | "prompts";

interface InboxEntryContextMenu {
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
  entryContextMenu: InboxEntryContextMenu;
}

export const inboxState = $state<InboxState>({
  entries: [],
  filter: "all",
  selectedId: null,
  isLoading: false,
  entryContextMenu: {
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

  inboxState.entryContextMenu.isVisible = true;
  inboxState.entryContextMenu.x = finalX;
  inboxState.entryContextMenu.y = finalY;
  inboxState.entryContextMenu.targetEntryId = targetEntryId;
  inboxState.entryContextMenu.isPrompt = isPrompt;
}

export function hideInboxContextMenu(): void {
  inboxState.entryContextMenu.isVisible = false;
  inboxState.entryContextMenu.targetEntryId = null;
}

export async function refreshInboxEntries(options?: {
  selectId?: string;
}): Promise<void> {
  setInboxLoading(true);
  try {
    const results = await fetchInboxEntries();
    setInboxEntries(results);

    if (options?.selectId) {
      selectInboxEntry(options.selectId);
    }
  } catch (error) {
    logger.error("Failed to load inbox entries", error);
  } finally {
    setInboxLoading(false);
  }
}
