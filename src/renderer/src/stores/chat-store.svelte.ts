// src/renderer/src/stores/chat-store.svelte.ts
import type {
  ChatSessionData,
  ChatMessage,
  ChatMode,
} from "../../../core/services/chat-engine/chat-session-repository.js";
import { getPreference } from "./local-preferences-store.svelte.js";

export interface ModelOption {
  modelId: `${string}/${string}`;
  // name: string;
  // provider: string;
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

// Core chat state - using object wrapper pattern for mutable state
export const chatState = $state<ChatState>({
  currentChat: null,
  availableModels: [],
  selectedModel:
    (getPreference("selectedModel") as `${string}/${string}`) || "cli/codex",
  chatMode: (getPreference("chatMode") as ChatMode) || "agent",
  messageInput: "",
  isSubmittingMessage: false,
  promptCursorPosition: null,
  isDraftSaving: false,
  hasUnsavedDraftChanges: false,
  // modelsLoading: false,
});

// Helper functions for working with chat stores
export function setCurrentChat(chat: ChatSessionData | null) {
  chatState.currentChat = chat;

  // Reset message input when switching chats
  if (chat?.metadata?.promptDraft) {
    chatState.messageInput = chat.metadata.promptDraft;
  } else {
    chatState.messageInput = "";
  }

  // Reset draft states when switching chats
  chatState.isDraftSaving = false;
  chatState.hasUnsavedDraftChanges = false;

  // Update chat settings from metadata
  if (chat?.metadata?.mode) {
    chatState.chatMode = chat.metadata.mode;
  }
}

export function clearCurrentChat() {
  chatState.currentChat = null;
  chatState.messageInput = "";
  chatState.isSubmittingMessage = false;
  chatState.isDraftSaving = false;
  chatState.hasUnsavedDraftChanges = false;
}

export function updateMessageInput(value: string) {
  chatState.messageInput = value;

  // Check if input differs from saved draft to mark as unsaved
  if (chatState.currentChat) {
    const savedDraft = chatState.currentChat.metadata?.promptDraft || "";
    const hasChanges = value !== savedDraft;
    chatState.hasUnsavedDraftChanges = hasChanges;
  }
}

export function clearMessageInput() {
  chatState.messageInput = "";
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

export function addMessageToCurrentChat(message: ChatMessage) {
  if (!chatState.currentChat) return;

  chatState.currentChat.messages = [...chatState.currentChat.messages, message];
  chatState.currentChat.updatedAt = new Date();
}

// export function updateChatMetadata(
//   metadata: Partial<ChatSessionData["metadata"]>,
// ) {
//   if (!chatState.currentChat) return;

//   chatState.currentChat.metadata = {
//     ...chatState.currentChat.metadata,
//     ...metadata,
//   };
//   chatState.currentChat.updatedAt = new Date();
// }

// Extract file references from message content
export function extractFileReferences(
  content: string,
): Array<{ path: string; type: "file" | "image"; syntax: "#" | "@" }> {
  const references: Array<{
    path: string;
    type: "file" | "image";
    syntax: "#" | "@";
  }> = [];

  // Pattern for both # and @ syntax
  const hashRegex =
    /#([^\s]+\.(png|jpg|jpeg|md|html|ts|js|tsx|jsx|json|css|svg|gif|pdf))/gi;
  const atRegex =
    /@([^\s]+\.(png|jpg|jpeg|md|html|ts|js|tsx|jsx|json|css|svg|gif|pdf))/gi;

  let match;

  // Extract # references
  while ((match = hashRegex.exec(content)) !== null) {
    if (match[1]) {
      const filePath = match[1];
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(filePath);
      references.push({
        path: filePath,
        type: isImage ? "image" : "file",
        syntax: "#",
      });
    }
  }

  // Extract @ references
  while ((match = atRegex.exec(content)) !== null) {
    if (match[1]) {
      const filePath = match[1];
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(filePath);
      references.push({
        path: filePath,
        type: isImage ? "image" : "file",
        syntax: "@",
      });
    }
  }

  return references;
}
