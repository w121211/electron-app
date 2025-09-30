// src/renderer/src/services/chat-service.ts
import { Logger } from "tslog";
import type { ChatUpdatedEvent } from "../../../core/services/chat-engine/events.js";
import type { CreateChatDraftConfig } from "../../../core/services/chat-engine/chat-draft-service.js";
import type { FileWatcherEvent } from "../../../core/services/file-watcher-service.js";
import type { ChatSessionData } from "../../../core/services/chat-engine/chat-session-repository.js";
import { isTerminalModel } from "../../../core/utils/model-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import {
  chatState,
  setCurrentChat,
  clearCurrentChat,
  type ModelOption,
} from "../stores/chat-store.svelte.js";
import {
  selectFile,
  expandParentDirectories,
  findNodeAndParent,
} from "../stores/tree-store.svelte.js";
import { setLoading, showToast } from "../stores/ui-store.svelte.js";
import { projectService } from "./project-service.js";
import { projectState } from "../stores/project-store.svelte.js";

async function startChatFromDraft(
  chat: ChatSessionData,
  modelId: `${string}/${string}`,
  message: { role: "user"; content: string | any[] },
) {
  // Validation
  if (chat._type !== "chat_draft") {
    throw new Error("Can only start chats from draft sessions");
  }
  if (!modelId) {
    throw new Error("Model ID is required to start a chat session");
  }

  if (isTerminalModel(modelId)) {
    // Use PTY chat router for terminal models
    if (typeof message.content !== "string") {
      console.error(message);
      throw new Error("Terminal models only accept string messages");
    }
    const updatedChat = await trpcClient.ptyChat.createPtyChatFromDraft.mutate({
      absoluteFilePath: chat.absoluteFilePath,
      modelId,
      initialPrompt: message.content,
    });
    return {
      turnResult: null, // PTY chats don't return turn results
      updatedChatSession: updatedChat,
    };
  } else {
    // Use chat engine router for non-terminal models
    const startResult = await trpcClient.chatEngine.startFromDraft.mutate({
      absoluteFilePath: chat.absoluteFilePath,
      modelId,
      message,
    });
    return startResult;
  }
}

class ChatService {
  private logger = new Logger({ name: "ChatService" });

  async createChatDraft(targetPath: string) {
    setLoading("createChat", true);

    try {
      const result = findNodeAndParent(projectState.folderTrees, targetPath);
      if (!result) {
        throw new Error(
          "Selected file or folder not found in the project tree.",
        );
      }

      const { node, parent } = result;

      let containingDirectory: string;
      if (node.isDirectory) {
        containingDirectory = node.path;
      } else {
        if (!parent) {
          // This should not happen for a file within a project folder
          throw new Error(
            "Could not find parent directory for the selected file.",
          );
        }
        containingDirectory = parent.path;
      }

      this.logger.info("Creating chat draft in:", containingDirectory);

      const draft = await trpcClient.chatDraft.createDraft.mutate({
        targetDirectory: containingDirectory,
        config: {
          mode: "agent", // Default mode for new chat sessions
        },
      });

      setCurrentChat(draft);
      this.logger.info("Chat draft created:", draft.id);

      // Expand parent directories and select the newly created chat file
      expandParentDirectories(draft.absoluteFilePath);
      selectFile(draft.absoluteFilePath);

      // Refresh file tree to show the newly created chat file
      await projectService.refreshProjectTreeForFile(draft.absoluteFilePath);

      return draft;
    } catch (error) {
      this.logger.error("Failed to create chat draft:", error);
      showToast(
        `Failed to create chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("createChat", false);
    }
  }

  async createChatFromTemplate(
    templatePath: string,
    args: string[],
    targetDirectory: string,
    config?: CreateChatDraftConfig,
  ) {
    setLoading("createChatFromTemplate", true);
    try {
      this.logger.info("Creating chat from template:", templatePath);

      const newChat = await trpcClient.chatDraft.createDraftFromTemplate.mutate(
        {
          templatePath,
          args,
          targetDirectory,
          config,
        },
      );

      setCurrentChat(newChat);
      showToast("Chat created from template successfully", "success");
      this.logger.info("Chat from template created:", newChat.id);

      // Expand parent directories and select the newly created chat file
      expandParentDirectories(newChat.absoluteFilePath);
      selectFile(newChat.absoluteFilePath);

      // Refresh file tree to show the newly created chat file
      await projectService.refreshProjectTreeForFile(newChat.absoluteFilePath);

      return newChat;
    } catch (error) {
      this.logger.error("Failed to create chat from template:", error);
      showToast(
        `Failed to create chat from template: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
      throw error;
    } finally {
      setLoading("createChatFromTemplate", false);
    }
  }

  async openChatFile(filePath: string) {
    setLoading("openChat", true);

    try {
      const session = await trpcClient.chatSession.getSession.query({
        absoluteFilePath: filePath,
      });
      setCurrentChat(session);
      return session;
    } catch (error) {
      this.logger.error("Failed to open chat file:", error);
      showToast(
        `Failed to open chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("openChat", false);
    }
  }

  async sendMesage(
    chat: ChatSessionData,
    messageText: string,
    modelId?: `${string}/${string}`,
    attachments?: Array<{ fileName: string; content: string }>,
  ) {
    // Ensure attachments is an array if provided
    const safeAttachments =
      attachments && Array.isArray(attachments) ? attachments : [];

    // Convert message and attachments to proper format
    let content: string | any[] = messageText;
    if (safeAttachments.length > 0) {
      content = [
        { type: "text", text: messageText },
        ...safeAttachments.map((att) => ({
          type: "text",
          text: `File: ${att.fileName}
${att.content}`,
        })),
      ];
    }
    const message = {
      role: "user" as const,
      content,
    };

    chatState.isSubmittingMessage = true;

    const postSendMessage = (updatedChatSession: ChatSessionData) => {
      setCurrentChat(updatedChatSession);
      chatState.messageInput = "";
      chatState.hasUnsavedDraftChanges = false;
      chatState.isSubmittingMessage = false;
    };

    if (chat._type === "chat_draft") {
      const startResult = await startChatFromDraft(chat, modelId!, message);

      postSendMessage(startResult.updatedChatSession);
      return startResult;
    }
    if (chat._type === "chat_engine") {
      const sendResult = await trpcClient.chatEngine.sendMessage.mutate({
        absoluteFilePath: chat.absoluteFilePath,
        chatSessionId: chat.id,
        message,
      });
      postSendMessage(sendResult.updatedChatSession);

      return sendResult;
    }
    if (chat._type === "pty_chat") {
      throw new Error("Use the terminal interface to interact with PTY chats");
    }

    throw new Error(
      "Send message not yet support chat session type:" + chat._type,
    );
  }

  async getAllChats() {
    setLoading("loadChats", true);

    try {
      this.logger.info("Loading all chats...");
      // Note: This method needs to be implemented in the backend or use file system scanning
      // For now, we'll need to rely on the file explorer to show chat files
      this.logger.warn("getAllChats not implemented in new chat client router");
      return [];
    } catch (error) {
      this.logger.error("Failed to load chats:", error);
      showToast(
        `Failed to load chats: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("loadChats", false);
    }
  }

  async confirmToolCall(
    absoluteFilePath: string,
    chatSessionId: string,
    toolCallId: string,
    outcome: "yes" | "no" | "yes_always",
  ) {
    try {
      this.logger.info("Confirming tool call:", toolCallId, outcome);
      const result = await trpcClient.chatEngine.confirmToolCall.mutate({
        absoluteFilePath,
        chatSessionId,
        toolCallId,
        outcome,
      });

      // Update current chat with the returned session data
      setCurrentChat(result.updatedChatSession);
      this.logger.info("Tool call confirmed successfully");
      return result;
    } catch (error) {
      this.logger.error("Failed to confirm tool call:", error);
      showToast(
        `Failed to confirm tool call: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  async abortChat(absoluteFilePath: string, chatSessionId: string) {
    setLoading("abortChat", true);

    try {
      this.logger.info("Aborting chat:", chatSessionId);
      const result = await trpcClient.chatEngine.abortChat.mutate({
        absoluteFilePath,
        chatSessionId,
      });
      this.logger.info("Chat aborted successfully");
      return result;
    } catch (error) {
      this.logger.error("Failed to abort chat:", error);
      showToast(
        `Failed to abort chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("abortChat", false);
    }
  }

  async getAvailableModels() {
    const models = await trpcClient.model.getAvailableModels.query();

    // Transform AvailableModels object to ModelOption array
    const modelOptions: ModelOption[] = [];

    // Add external models
    Object.entries(models.external).forEach(([, model]) => {
      const externalModel = model;
      modelOptions.push({
        modelId: model.modelId,
        // name: id.split("/")[1] || id, // Use model name after slash
        // provider: "terminal",
        enabled: externalModel.enabled,
      });
    });

    // // Add internal models
    // Object.entries(models.internal).forEach(([id, model]) => {
    //   const internalModel = model;
    //   modelOptions.push({
    //     id,
    //     // name: internalModel.modelId,
    //     provider: internalModel.provider,
    //     enabled: internalModel.enabled,
    //   });
    // });

    chatState.availableModels = modelOptions;

    return models;
  }

  async deleteChat(absoluteFilePath: string) {
    setLoading("deleteChat", true);

    try {
      this.logger.info("Deleting chat:", absoluteFilePath);
      const current = chatState.currentChat;
      let result: { success: boolean };

      if (current && current.absoluteFilePath === absoluteFilePath) {
        if (current._type === "chat_draft") {
          result = await trpcClient.chatDraft.deleteDraft.mutate({
            absoluteFilePath,
          });
        } else if (current._type === "pty_chat") {
          result = await trpcClient.ptyChat.deletePtyChat.mutate({
            absoluteFilePath,
          });
        } else {
          result = await trpcClient.chatEngine.deleteSession.mutate({
            absoluteFilePath,
          });
        }
      } else {
        try {
          result = await trpcClient.chatEngine.deleteSession.mutate({
            absoluteFilePath,
          });
        } catch (engineError) {
          const isEngineTypeMismatch =
            engineError instanceof Error &&
            engineError.message.includes("chat engine session");
          if (!isEngineTypeMismatch) {
            throw engineError;
          }

          try {
            result = await trpcClient.chatDraft.deleteDraft.mutate({
              absoluteFilePath,
            });
          } catch (draftError) {
            const isDraftTypeMismatch =
              draftError instanceof Error &&
              draftError.message.includes("not a draft session");
            if (!isDraftTypeMismatch) {
              throw draftError;
            }

            result = await trpcClient.ptyChat.deletePtyChat.mutate({
              absoluteFilePath,
            });
          }
        }
      }
      this.logger.info("Chat deleted successfully");

      // Clear current chat if it was the deleted one
      if (
        chatState.currentChat &&
        chatState.currentChat.absoluteFilePath === absoluteFilePath
      ) {
        clearCurrentChat();
      }

      // Refresh file tree
      await projectService.refreshProjectTreeForFile(absoluteFilePath);

      return result;
    } catch (error) {
      this.logger.error("Failed to delete chat:", error);
      showToast(
        `Failed to delete chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("deleteChat", false);
    }
  }

  async rerunChat(absoluteFilePath: string, chatSessionId: string) {
    setLoading("rerunChat", true);

    try {
      this.logger.info("Re-running chat:", chatSessionId);
      const result = await trpcClient.chatEngine.rerunSession.mutate({
        absoluteFilePath,
        chatSessionId,
      });
      this.logger.info("Chat re-run successfully");
      return result;
    } catch (error) {
      this.logger.error("Failed to re-run chat:", error);
      showToast(
        `Failed to re-run chat: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    } finally {
      setLoading("rerunChat", false);
    }
  }

  async savePromptDraft(absoluteFilePath: string, draft: string) {
    const chat = chatState.currentChat;

    if (chat === null) {
      throw new Error("No current chat");
    }
    if (chat.absoluteFilePath !== absoluteFilePath) {
      throw new Error(
        "Chat file path does not match current chat. Now only support working chat to save draft",
      );
    }

    chatState.isDraftSaving = true;

    if (chat._type === "chat_draft") {
      await trpcClient.chatDraft.updateDraft.mutate({
        absoluteFilePath,
        updates: {
          metadata: { promptDraft: draft },
        },
      });
    } else if (chat._type === "pty_chat") {
      await trpcClient.ptyChat.updateMetadata.mutate({
        absoluteFilePath,
        metadata: { promptDraft: draft },
      });
    } else {
      await trpcClient.chatEngine.updateSession.mutate({
        absoluteFilePath,
        updates: {
          metadata: { promptDraft: draft },
        },
      });
    }
    this.logger.debug("Prompt draft saved for chat:", absoluteFilePath);

    chatState.isDraftSaving = false;
    chatState.hasUnsavedDraftChanges = false;
  }

  // Event handlers
  handleFileEvent(event: FileWatcherEvent) {
    // Check if a chat file was deleted and it's the currently open chat
    if (event.eventType === "unlink" && !event.isDirectory) {
      const currentChat = chatState.currentChat;

      if (
        currentChat &&
        currentChat.absoluteFilePath === event.absoluteFilePath
      ) {
        this.logger.info(
          `Currently open chat file was deleted: ${event.absoluteFilePath}`,
        );

        // Clear the current chat since the file no longer exists
        clearCurrentChat();

        // Show a notification to the user
        showToast("The currently open chat file was deleted", "warning");
      }
    }
  }

  handleChatEvent(event: ChatUpdatedEvent) {
    this.logger.debug("Handling chat event:", event.updateType, event.chatId);

    // Update current chat if it matches the event
    if (chatState.currentChat && chatState.currentChat.id === event.chatId) {
      switch (event.updateType) {
        case "AI_RESPONSE_STARTED":
          this.logger.debug("AI response started for chat:", event.chatId);
          setCurrentChat(event.chat);
          break;
        case "AI_RESPONSE_STREAMING":
          this.logger.debug("AI streaming content updated");
          setCurrentChat(event.chat);
          break;
        case "AI_RESPONSE_COMPLETED":
          this.logger.debug("AI response completed for chat:", event.chatId);
          setCurrentChat(event.chat);
          break;
        case "METADATA_UPDATED":
          this.logger.debug("Chat metadata updated");
          setCurrentChat(event.chat);
          break;
        case "MESSAGE_ADDED":
          // User messages are handled by mutation response, skip event
          this.logger.debug("User message event - already handled by mutation");
          break;
        case "STATUS_CHANGED":
          this.logger.debug("Chat status changed:", event.update.status);
          setCurrentChat(event.chat);
          break;
        default:
          setCurrentChat(event.chat);
      }
    }
  }
}

export const chatService = new ChatService();
