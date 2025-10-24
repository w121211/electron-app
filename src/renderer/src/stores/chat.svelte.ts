// src/renderer/src/stores/chat.svelte.ts
import { Logger } from "tslog";
import { getPreference } from "../lib/local-storage.js";
import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import type { AvailableModels } from '../../../core/utils/model-utils.js';

// @ts-expect-error - Intentionally unused for future use
const logger = new Logger({ name: "chatStore" });

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export interface ChatSessionState {
  data: ChatSessionData;
  lastSyncedAt: string | null;
  // driftWarnings: PromptScriptDriftWarning[];
  // isReplayQueued: boolean;
}

// export const chatSessions = new SvelteMap<string, ChatSessionState>();
export const chatSessions: Record<string, ChatSessionState> = $state({});

export const setChatSession = (session: ChatSessionData): ChatSessionState => {
  const existing = chatSessions[session.id];
  const now = toIsoTimestamp();

  if (existing) {
    existing.data = session;
    existing.lastSyncedAt = now;
  } else {
    chatSessions[session.id] = {
      data: session,
      lastSyncedAt: now,
    };
  }

  return chatSessions[session.id];
};

export const getChatSessionStates = () => Object.values(chatSessions);

export const getRunningChatSessionStates = () => {
  return getChatSessionStates()
    .filter((state) => state.data.state !== "terminated")
    .slice()
    .sort((a, b) => {
      const updatedA = new Date(a.data.updatedAt).getTime();
      const updatedB = new Date(b.data.updatedAt).getTime();
      return updatedB - updatedA;
    });
};

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
