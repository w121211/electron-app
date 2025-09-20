// src/core/services/chat-queue-manager.ts
import { ILogObj, Logger } from "tslog";
import type { ChatSessionRepository } from "./chat-engine/chat-session-repository.js";
import type { IEventBus } from "../event-bus.js";
import type { ChatUpdatedEvent } from "./chat-engine/events.js";
import type { UserModelMessage } from "ai";
import { isTerminalModel } from "../utils/model-utils.js";
import type { ChatClient } from "./chat-engine/chat-client.js";
import type { ExternalChatClient } from "./external-chat/external-chat-client.js";
import { ChatQueueRepository } from "./chat-queue-repository.js";
import type { ServerFileWatcherEvent } from "../event-types.js";
import { promises as fs } from "fs";

export class ChatQueueManager {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "ChatQueueManager",
  });
  private readonly busyModels = new Set<string>();

  constructor(
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly chatQueueRepository: ChatQueueRepository,
    private readonly eventBus: IEventBus,
    private readonly chatClient: ChatClient<any>,
    private readonly externalChatClient: ExternalChatClient,
  ) {
    this.logger.info("ChatQueueManager initialized");
    this.eventBus.subscribe(
      "ChatUpdatedEvent",
      this.handleChatUpdated.bind(this),
    );
    this.eventBus.subscribe(
      "ServerFileWatcherEvent",
      this.handleFileWatcherEvent.bind(this),
    );
  }

  public async init(): Promise<void> {
    this.logger.info("Initializing chat queue...");
    const items = await this.chatQueueRepository.getAllItems();
    const modelIds = new Set(items.map((item) => item.modelId));

    this.logger.info(
      `Found ${items.length} items across ${modelIds.size} model queues. Triggering processing.`,
    );

    for (const modelId of modelIds) {
      this.tryRunNext(modelId);
    }
  }

  public async schedule(
    chatId: string,
    absoluteFilePath: string,
  ): Promise<void> {
    this.logger.info(`Scheduling chat ${chatId} at ${absoluteFilePath}`);
    const sessionData =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    if (!sessionData.modelId) {
      this.logger.error(`Cannot schedule chat ${chatId} without a modelId.`);
      sessionData.sessionStatus = "error";
      await this.chatSessionRepository.saveToFile(
        absoluteFilePath,
        sessionData,
      );
      return;
    }

    sessionData.sessionStatus = "scheduled";
    await this.chatSessionRepository.saveToFile(absoluteFilePath, sessionData);

    await this.chatQueueRepository.addItem({
      chatId,
      absoluteFilePath,
      modelId: sessionData.modelId,
    });

    this.tryRunNext(sessionData.modelId);
  }

  public tryRunNext(modelId?: string): void {
    if (modelId) {
      this.processModelQueue(modelId);
    } else {
      this.logger.warn(
        "tryRunNext called without a modelId. Processing will only start for models that have items added.",
      );
    }
  }

  private async handleChatUpdated(event: ChatUpdatedEvent): Promise<void> {
    const { chatId, updateType, chat } = event;
    const modelId = chat.modelId;

    if (!modelId) {
      this.logger.warn(
        `ChatUpdatedEvent for ${chatId} has no modelId. Cannot update busy status.`,
      );
      return;
    }

    if (
      updateType === "AI_RESPONSE_COMPLETED" ||
      (updateType === "STATUS_CHANGED" &&
        chat.sessionStatus !== "processing" &&
        chat.sessionStatus !== "waiting_confirmation")
    ) {
      this.logger.info(`Model ${modelId} is now free.`);
      this.busyModels.delete(modelId);
      // Use the file path from the chat object to remove from the queue
      await this.chatQueueRepository.removeItem(chat.absoluteFilePath);
      this.tryRunNext(modelId);
    }
  }

  private async handleFileWatcherEvent(
    event: ServerFileWatcherEvent,
  ): Promise<void> {
    const { fsEventKind, srcPath, isDirectory } = event.data;

    if (isDirectory || !srcPath.endsWith(".chat.json")) {
      return;
    }

    if (fsEventKind === "unlink") {
      this.logger.info(`Chat file deleted: ${srcPath}. Removing from queue.`);
      await this.chatQueueRepository.removeItem(srcPath);
    }

    if (fsEventKind === "add") {
      this.logger.info(
        `Chat file added: ${srcPath}. Checking if it should be scheduled.`,
      );
      try {
        const sessionData =
          await this.chatSessionRepository.loadFromFile(srcPath);
        if (sessionData.sessionStatus === "scheduled") {
          await this.schedule(sessionData.id, sessionData.absoluteFilePath);
        }
      } catch (error) {
        this.logger.error(
          `Error processing added chat file ${srcPath}:`,
          error,
        );
      }
    }
  }

  private async processModelQueue(modelId: string): Promise<void> {
    if (this.busyModels.has(modelId)) {
      this.logger.debug(`Model ${modelId} is busy. Skipping.`);
      return;
    }

    const nextChat = await this.chatQueueRepository.getNextInQueue(modelId);
    if (!nextChat) {
      this.logger.debug(`No chats in queue for model ${modelId}.`);
      return;
    }

    // --- Verification Step ---
    try {
      await fs.access(nextChat.absoluteFilePath);
    } catch (error) {
      this.logger.warn(
        `File ${nextChat.absoluteFilePath} not found for queued chat. Removing orphan.`,
      );
      await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
      this.processModelQueue(modelId); // Try next
      return;
    }

    const sessionData = await this.chatSessionRepository.loadFromFile(
      nextChat.absoluteFilePath,
    );
    if (sessionData.id !== nextChat.chatId) {
      this.logger.error(
        `Chat ID mismatch for ${nextChat.absoluteFilePath}. Expected ${nextChat.chatId}, found ${sessionData.id}. File may have been swapped. Removing invalid queue item.`,
      );
      await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
      this.processModelQueue(modelId); // Try next
      return;
    }
    // --- End Verification ---

    this.busyModels.add(modelId);
    this.logger.info(`Running chat ${nextChat.chatId} on model ${modelId}`);

    try {
      const prompt = sessionData.metadata?.promptDraft;
      if (!prompt) {
        this.logger.warn(
          `Chat ${nextChat.chatId} has no promptDraft. Freeing queue.`,
        );
        this.busyModels.delete(modelId);
        await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
        this.processModelQueue(modelId);
        return;
      }

      const userInput: UserModelMessage = {
        role: "user",
        content: prompt,
      };

      if (isTerminalModel(sessionData.modelId)) {
        await this.externalChatClient.sendMessageToExternal(
          nextChat.absoluteFilePath,
          nextChat.chatId,
          userInput,
        );
      } else {
        await this.chatClient.sendMessage(
          nextChat.absoluteFilePath,
          nextChat.chatId,
          userInput,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error running chat ${nextChat.chatId} on model ${modelId}:`,
        error,
      );
      this.busyModels.delete(modelId);
      this.tryRunNext(modelId);
    }
  }
}
