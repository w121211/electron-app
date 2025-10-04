// src/renderer/src/stores/chat-store.svelte.ts
import type {
  ChatSessionData,
  ChatMessage,
  ChatMode,
} from "../../../core/services/chat-engine/chat-session-repository.js";
import { getPreference, setPreference } from "../lib/local-storage.js";
import { getSelectedDocContext } from "./ui.svelte.js";

export interface ModelOption {
  modelId: `${string}/${string}`;
  enabled: boolean;
}

interface ChatState {
  currentChat: ChatSessionData | null;
  availableModels: ModelOption[];
  selectedModel: `${string}/${string}`;
  chatMode: ChatMode;
  messageInput: string;
  isSubmittingMessage: boolean;
  promptCursorPosition: { start: number; end: number } | null;
  isDraftSaving: boolean;
  hasUnsavedDraftChanges: boolean;
}

function resolveInitialModel(): `${string}/${string}` {
  const saved = getPreference("selectedModel") as `${string}/${string}` | null;
  return saved ?? "openai/gpt-4o-mini";
}

function resolveInitialMode(): ChatMode {
  const saved = getPreference("chatMode") as ChatMode | null;
  return saved ?? "agent";
}

export const chatState = $state<ChatState>({
  currentChat: null,
  availableModels: [],
  selectedModel: resolveInitialModel(),
  chatMode: resolveInitialMode(),
  messageInput: "",
  isSubmittingMessage: false,
  promptCursorPosition: null,
  isDraftSaving: false,
  hasUnsavedDraftChanges: false,
});

let lastSessionId: string | null = null;

// $effect(() => {
//   const activeChatSession = getSelectedDocContext()?.chatSessionState;

//   const runtime = activeChatSession;
//   const session = runtime?.data ?? null;
//   const sessionId = session?.id ?? null;

//   if (sessionId !== lastSessionId) {
//     chatState.messageInput = session?.metadata?.promptDraft ?? "";
//     chatState.isSubmittingMessage = false;
//     chatState.isDraftSaving = false;
//     chatState.hasUnsavedDraftChanges = false;
//     chatState.promptCursorPosition = null;

//     if (session?.metadata?.mode) {
//       chatState.chatMode = session.metadata.mode;
//     }

//     lastSessionId = sessionId;
//   }

//   chatState.currentChat = session;
// });

// $effect(() => {
//   setPreference("selectedModel", chatState.selectedModel);
//   setPreference("chatMode", chatState.chatMode);
// });

export function setCurrentChat(chat: ChatSessionData | null) {
  chatState.currentChat = chat;
  chatState.messageInput = chat?.metadata?.promptDraft ?? "";
  chatState.isSubmittingMessage = false;
  chatState.isDraftSaving = false;
  chatState.hasUnsavedDraftChanges = false;
  chatState.promptCursorPosition = null;
  if (chat?.metadata?.mode) {
    chatState.chatMode = chat.metadata.mode;
  }
  lastSessionId = chat?.id ?? null;
}

export function clearCurrentChat() {
  setCurrentChat(null);
}

export function updateMessageInput(value: string) {
  chatState.messageInput = value;

  const draft = chatState.currentChat?.metadata?.promptDraft ?? "";
  chatState.hasUnsavedDraftChanges = value !== draft;
}

export function clearMessageInput() {
  updateMessageInput("");
}

export function savePromptCursorPosition(start: number, end: number) {
  chatState.promptCursorPosition = { start, end };
}

export function clearPromptCursorPosition() {
  chatState.promptCursorPosition = null;
}

export function setDraftSaving(saving: boolean) {
  chatState.isDraftSaving = saving;
}

export function setHasUnsavedDraftChanges(hasChanges: boolean) {
  chatState.hasUnsavedDraftChanges = hasChanges;
}

export function setSubmitting(isSubmitting: boolean) {
  chatState.isSubmittingMessage = isSubmitting;
}

export function setAvailableModels(models: ModelOption[]) {
  chatState.availableModels = models;
}

export function addMessageToCurrentChat(message: ChatMessage) {
  if (!chatState.currentChat) return;

  chatState.currentChat.messages = [...chatState.currentChat.messages, message];
  chatState.currentChat.updatedAt = new Date();
}

export function extractFileReferences(
  content: string,
): Array<{ path: string; type: "file" | "image"; syntax: "#" | "@" }> {
  const references: Array<{
    path: string;
    type: "file" | "image";
    syntax: "#" | "@";
  }> = [];

  const hashRegex =
    /#([^\s]+\.(png|jpg|jpeg|md|html|ts|js|tsx|jsx|json|css|svg|gif|pdf))/gi;
  const atRegex =
    /@([^\s]+\.(png|jpg|jpeg|md|html|ts|js|tsx|jsx|json|css|svg|gif|pdf))/gi;

  let match: RegExpExecArray | null;

  while ((match = hashRegex.exec(content)) !== null) {
    if (!match[1]) continue;
    const filePath = match[1];
    const isImage = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(filePath);
    references.push({
      path: filePath,
      type: isImage ? "image" : "file",
      syntax: "#",
    });
  }

  while ((match = atRegex.exec(content)) !== null) {
    if (!match[1]) continue;
    const filePath = match[1];
    const isImage = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(filePath);
    references.push({
      path: filePath,
      type: isImage ? "image" : "file",
      syntax: "@",
    });
  }

  return references;
}
