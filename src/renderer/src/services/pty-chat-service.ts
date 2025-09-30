// src/renderer/src/services/pty-chat-service.ts
import { Logger } from "tslog";
import { isTerminalModel } from "../../../core/utils/model-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import type { ChatMetadata } from "../../../core/services/chat-engine/chat-session-repository.js";
import { chatState, setCurrentChat } from "../stores/chat-store.svelte.js";
import { showToast } from "../stores/ui-store.svelte.js";
import { projectService } from "./project-service.js";

class PtyChatService {
  private logger = new Logger({ name: "PtyChatService" });

  async createPtyChat(
    targetDirectory: string,
    modelId: `${string}/${string}`,
    initialPrompt?: string,
  ) {
    const newChat = await trpcClient.ptyChat.createPtyChat.mutate({
      targetDirectory,
      modelId,
      initialPrompt,
    });
    setCurrentChat(newChat);

    // Refresh file tree to show the newly created chat file
    await projectService.refreshProjectTreeForFile(newChat.absoluteFilePath);

    return newChat;
  }

  async createPtyChatFromDraft(initialCommand: string) {
    const currentChat = chatState.currentChat;
    if (!currentChat) {
      return;
    }

    const trimmedCommand = initialCommand.trim();
    if (!trimmedCommand) {
      showToast("Enter a command before starting a PTY session", "info");
      return;
    }

    const selectedModel = chatState.selectedModel;
    if (!selectedModel || !isTerminalModel(selectedModel)) {
      showToast(
        "Select a terminal model before starting a PTY session",
        "info",
      );
      return;
    }

    const session = await trpcClient.ptyChat.createPtyChatFromDraft.mutate({
      absoluteFilePath: currentChat.absoluteFilePath,
      initialPrompt: trimmedCommand,
      modelId: selectedModel,
    });

    setCurrentChat(session);
    chatState.messageInput = "";
    chatState.hasUnsavedDraftChanges = false;

    await projectService.refreshProjectTreeForFile(session.absoluteFilePath);
  }

  async getPtyChat(absoluteFilePath: string) {
    const session = await trpcClient.ptyChat.getPtyChat.query({
      absoluteFilePath,
    });

    setCurrentChat(session);
    this.logger.info("PTY chat session loaded:", session.id);
    return session;
  }

  async updateMetadata(
    absoluteFilePath: string,
    metadata: Partial<ChatMetadata>,
  ) {
    const session = await trpcClient.ptyChat.updateMetadata.mutate({
      absoluteFilePath,
      metadata,
    });

    // Update the store if this is the current chat
    // Disabled: when setting the store, it causes the PTY chat renderer weird output (yet to investigate)
    // For now just comment it out, do not remove
    // if (chatState.currentChat?.absoluteFilePath === absoluteFilePath) {
    //   setCurrentChat(session);
    // }

    return session;
  }
}

export const ptyChatService = new PtyChatService();
