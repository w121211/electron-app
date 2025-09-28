// src/renderer/src/services/pty-chat-service.ts
import { Logger } from "tslog";
import { isTerminalModel } from "../../../core/utils/model-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import type { ChatMetadata } from "../../../core/services/chat-engine/chat-session-repository.js";
import {
  chatState,
  setCurrentChat,
  clearMessageInput,
  setHasUnsavedDraftChanges,
} from "../stores/chat-store.svelte.js";
import { setLoading, showToast } from "../stores/ui-store.svelte.js";
import { projectService } from "./project-service.js";

class PtyChatService {
  private logger = new Logger({ name: "PtyChatService" });

  async createPtyChat(
    targetDirectory: string,
    modelId: `${string}/${string}`,
    initialPrompt?: string,
  ) {
    setLoading("createPtyChat", true);

    try {
      this.logger.info("Creating PTY chat in:", targetDirectory);

      const newChat = await trpcClient.ptyChat.createPtyChat.mutate({
        targetDirectory,
        modelId,
        initialPrompt,
      });

      setCurrentChat(newChat);
      this.logger.info("PTY chat created:", newChat.id);

      // Refresh file tree to show the newly created chat file
      await projectService.refreshProjectTreeForFile(newChat.absoluteFilePath);

      return newChat;
    } catch (error) {
      this.logger.error("Failed to create PTY chat:", error);
      showToast(
        `Failed to create PTY chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("createPtyChat", false);
    }
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

    setLoading("startPtySession", true);

    try {
      const session = await trpcClient.ptyChat.createPtyChatFromDraft.mutate({
        absoluteFilePath: currentChat.absoluteFilePath,
        initialPrompt: trimmedCommand,
        modelId: selectedModel,
      });

      setCurrentChat(session);
      clearMessageInput();
      setHasUnsavedDraftChanges(false);
      showToast("PTY session started", "success");

      await projectService.refreshProjectTreeForFile(session.absoluteFilePath);
    } catch (error) {
      this.logger.error("Failed to start PTY session:", error);
      showToast(
        `Failed to start PTY session: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    } finally {
      setLoading("startPtySession", false);
    }
  }

  async getPtyChat(absoluteFilePath: string) {
    setLoading("loadPtyChat", true);

    try {
      this.logger.info("Loading PTY chat session:", absoluteFilePath);
      const session = await trpcClient.ptyChat.getPtyChat.query({
        absoluteFilePath,
      });

      setCurrentChat(session);
      this.logger.info("PTY chat session loaded:", session.id);
      return session;
    } catch (error) {
      this.logger.error("Failed to load PTY chat session:", error);
      showToast(
        `Failed to load PTY chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("loadPtyChat", false);
    }
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
