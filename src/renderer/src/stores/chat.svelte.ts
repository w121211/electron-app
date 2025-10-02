// src/renderer/src/stores/chat.svelte.ts

import { SvelteMap } from "svelte/reactivity";
import type {
  ChatSessionData,
  ChatSessionStatus,
  ChatMessage,
} from "../../../core/services/chat-engine/chat-session-repository.js";
import type { PromptScriptDriftStatus } from "./documents.svelte.js";

export type ChatHydrationStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "error";

export interface PromptScriptDriftWarning {
  kind: "script_changed" | "session_missing" | "hash_mismatch" | "metadata_conflict";
  severity: "info" | "warning" | "error";
  message: string;
  acknowledged: boolean;
}

export interface ChatSessionState {
  data: ChatSessionData;
  hydration: ChatHydrationStatus;
  driftWarnings: PromptScriptDriftWarning[];
  lastSyncedAt: string | null;
  isReplayQueued: boolean;
}

export interface SessionLinkState {
  sessionId: string | null;
  scriptHash: string | null;
  status: PromptScriptDriftStatus;
  warnings: PromptScriptDriftWarning[];
  lastAttachedAt: string | null;
}

export const chatSessions = new SvelteMap<string, ChatSessionState>();

export const sessionLinks = new SvelteMap<string, SessionLinkState>();

export const getChatSessionList = () => [...chatSessions.values()];

export const getActiveStreamingSessions = () =>
  getChatSessionList().filter((session) => session.hydration === "streaming");

export const getOrphanedChatSessions = () =>
  getChatSessionList().filter((session) => {
    for (const link of sessionLinks.values()) {
      if (link.sessionId === session.data.id) {
        return false;
      }
    }
    return true;
  });

export const getChatSessionMessages = () =>
  new Map<string, ChatMessage[]>(
    getChatSessionList().map((session) => [session.data.id, session.data.messages]),
  );

export const getChatSessionStatuses = () =>
  new Map<string, ChatSessionStatus>(
    getChatSessionList().map((session) => [session.data.id, session.data.sessionStatus]),
  );