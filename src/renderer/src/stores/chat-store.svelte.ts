// src/renderer/src/stores/chat-store.svelte.ts
import type {
  ChatSessionData,
  ChatMessage,
  ChatMode,
} from "../../../core/services/chat-engine/chat-session-repository.js";
import { getPreference } from "./local-preferences-store.svelte.js";

interface ChatState {
  currentChat: ChatSessionData | null;
  messageInput: string;
  chatMode: ChatMode;
  selectedModel: string;
  isSubmittingMessage: boolean;
  promptCursorPosition: { start: number; end: number } | null;
}

// Core chat state - using object wrapper pattern for mutable state
export const chatState = $state<ChatState>({
  currentChat: null,
  messageInput: "",
  chatMode: (getPreference("chatMode") as ChatMode) || "agent",
  selectedModel: getPreference("selectedModel") || "terminal/codex",
  isSubmittingMessage: false,
  promptCursorPosition: null,
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

  // Update chat settings from metadata
  if (chat?.metadata?.mode) {
    chatState.chatMode = chat.metadata.mode;
  }
}

export function clearCurrentChat() {
  chatState.currentChat = null;
  chatState.messageInput = "";
  chatState.isSubmittingMessage = false;
}

export function updateMessageInput(value: string) {
  chatState.messageInput = value;
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

export function addMessageToCurrentChat(message: ChatMessage) {
  if (!chatState.currentChat) return;

  chatState.currentChat.messages = [...chatState.currentChat.messages, message];
  chatState.currentChat.updatedAt = new Date();
}

export function updateChatMetadata(
  metadata: Partial<ChatSessionData["metadata"]>,
) {
  if (!chatState.currentChat) return;

  chatState.currentChat.metadata = {
    ...chatState.currentChat.metadata,
    ...metadata,
  };
  chatState.currentChat.updatedAt = new Date();
}

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
