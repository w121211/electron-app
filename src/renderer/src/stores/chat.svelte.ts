// src/renderer/src/stores/chat.svelte.ts

import { SvelteMap } from "svelte/reactivity";
import { getPreference } from "../lib/local-storage.js";
import type {
  ChatSessionData,
  ChatSessionStatus,
  ChatMessage,
} from "../../../core/services/chat/chat-session-repository.js";
import type { AvailableModels } from "../../../core/utils/model-utils.js";
import type { PromptScriptDriftStatus } from "./documents.svelte.js";

export interface PromptScriptDriftWarning {
  kind:
    | "script_changed"
    | "session_missing"
    | "hash_mismatch"
    | "metadata_conflict";
  severity: "info" | "warning" | "error";
  message: string;
  acknowledged: boolean;
}

export interface ChatSessionState {
  data: ChatSessionData;
  driftWarnings: PromptScriptDriftWarning[];
  lastSyncedAt: string | null;
  isReplayQueued: boolean;
}

export interface ChatSessionLinkState {
  sessionId: string | null;
  scriptHash: string | null;
  status: PromptScriptDriftStatus;
  warnings: PromptScriptDriftWarning[];
  lastAttachedAt: string | null;
}

export const chatSessions = new SvelteMap<string, ChatSessionState>();

export const chatSessionLinks = new SvelteMap<string, ChatSessionLinkState>();

export const getLinkedChatSession = (
  filePath: string,
): ChatSessionState | null => {
  const sessionLink = chatSessionLinks.get(filePath);
  if (sessionLink?.sessionId) {
    return chatSessions.get(sessionLink.sessionId) ?? null;
  }
  return null;
};

export const getChatSessionList = () => [...chatSessions.values()];

export const getOrphanedChatSessions = () =>
  getChatSessionList().filter((session) => {
    for (const link of chatSessionLinks.values()) {
      if (link.sessionId === session.data.id) {
        return false;
      }
    }
    return true;
  });

export const getChatSessionMessages = () =>
  new Map<string, ChatMessage[]>(
    getChatSessionList().map((session) => [
      session.data.id,
      session.data.messages,
    ]),
  );

export const getChatSessionStatuses = () =>
  new Map<string, ChatSessionStatus>(
    getChatSessionList().map((session) => [
      session.data.id,
      session.data.sessionStatus,
    ]),
  );

// --- Global chat settings ---

interface ChatGlobalSettings {
  availableModels: AvailableModels;
  selectedModel: `${string}/${string}`;
}

const resolveInitialModel = (): `${string}/${string}` => {
  const saved = getPreference("selectedModel") as `${string}/${string}` | null;
  return saved ?? "cli/codex";
};

export const chatSettings = $state<ChatGlobalSettings>({
  availableModels: { external: {}, internal: {} },
  selectedModel: resolveInitialModel(),
});

export const getAvailableModelsAsList = () => [
  ...Object.values(chatSettings.availableModels.external),
  // ...Object.values(chatSettings.availableModels.internal),
];

export const setAvailableModels = (models: AvailableModels) => {
  chatSettings.availableModels = models;
};

export const setSelectedModel = (modelId: `${string}/${string}`) => {
  chatSettings.selectedModel = modelId;
};
