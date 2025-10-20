// src/core/services/chat-queue-manager.ts
import { Logger, type ILogObj } from "tslog";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "./chat/chat-session-repository.js";
import type { IEventBus } from "../event-bus.js";
import type { ChatUpdatedEvent } from "./chat-engine/events.js";
import type { UserModelMessage } from "ai";
import { isTerminalModel } from "../../shared/utils/model-utils.js";
import type { ApiChatClient } from "./chat-engine/api-chat-client.js";
import { ChatQueueRepository } from "./chat-queue-repository.js";

export class ChatQueueManager {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "ChatQueueManager",
  });
  private readonly busyModels = new Set<string>();

  constructor(
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly chatQueueRepository: ChatQueueRepository,
    private readonly eventBus: IEventBus,
    private readonly chatClient: ApiChatClient,
  ) {
    this.logger.info("ChatQueueManager initialized");
    this.eventBus.subscribe(
      "ChatUpdatedEvent",
      this.handleChatUpdated.bind(this),
    );
  }

  public async init(): Promise<void> {
    const items = await this.chatQueueRepository.getAllItems();
    const modelIds = new Set(items.map((item) => item.modelId));
    if (modelIds.size === 0) {
      this.logger.info("No queued chats found on startup.");
      return;
    }

    this.logger.info(
      `Initializing chat queue with ${items.length} item(s) across ${modelIds.size} model(s).`,
    );

    for (const modelId of modelIds) {
      this.tryRunNext(modelId);
    }
  }

  public async schedule(
    chatId: string,
    absoluteFilePath: string,
  ): Promise<void> {
    const session = await this.chatSessionRepository.getById(chatId);
    if (!session) {
      this.logger.error(
        `Cannot schedule chat ${chatId}. Session was not found in repository.`,
      );
      return;
    }

    const modelId = session.metadata?.modelId;
    if (!modelId) {
      this.logger.error(
        `Cannot schedule chat ${chatId}. Session metadata is missing modelId.`,
      );
      return;
    }

    await this.updateSessionState(session, "queued");

    await this.chatQueueRepository.addItem({
      chatId,
      absoluteFilePath,
      modelId,
    });

    this.logger.info(`Queued chat ${chatId} for model ${modelId}.`);
    this.tryRunNext(modelId);
  }

  public tryRunNext(modelId?: string): void {
    if (!modelId) {
      this.logger.warn(
        "tryRunNext called without a modelId. Ignoring request.",
      );
      return;
    }

    void this.processModelQueue(modelId);
  }

  private async handleChatUpdated(event: ChatUpdatedEvent): Promise<void> {
    const modelId = event.chat.metadata?.modelId;
    if (!modelId) {
      this.logger.warn(
        `ChatUpdatedEvent for ${event.chatId} did not include a modelId.`,
      );
      return;
    }

    const state = event.chat.state;
    if (
      event.updateType === "AI_RESPONSE_COMPLETED" ||
      (event.updateType === "STATUS_CHANGED" &&
        state !== "active:generating")
    ) {
      this.logger.info(`Model ${modelId} is available. Checking queue...`);
      this.busyModels.delete(modelId);
      await this.removeQueueItemForChat(event.chatId);
      this.tryRunNext(modelId);
    }
  }

  private async processModelQueue(modelId: string): Promise<void> {
    if (this.busyModels.has(modelId)) {
      this.logger.debug(`Model ${modelId} is currently running. Skipping.`);
      return;
    }

    const nextChat = await this.chatQueueRepository.getNextInQueue(modelId);
    if (!nextChat) {
      this.logger.debug(`No queued chats for model ${modelId}.`);
      return;
    }

    const session = await this.chatSessionRepository.getById(nextChat.chatId);
    if (!session) {
      this.logger.warn(
        `Queued chat ${nextChat.chatId} no longer exists. Removing from queue.`,
      );
      await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
      this.tryRunNext(modelId);
      return;
    }

    const promptDraft = session.metadata?.promptDraft;
    if (!promptDraft || promptDraft.trim().length === 0) {
      this.logger.warn(
        `Chat ${session.id} has no promptDraft. Removing from queue.`,
      );
      await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
      this.tryRunNext(modelId);
      return;
    }

    if (isTerminalModel(modelId)) {
      this.logger.warn(
        `Terminal models (${modelId}) are not currently supported by ChatQueueManager. Removing queued item.`,
      );
      await this.chatQueueRepository.removeItem(nextChat.absoluteFilePath);
      return;
    }

    this.busyModels.add(modelId);
    await this.updateSessionState(session, "active:generating");

    const userInput: UserModelMessage = {
      role: "user",
      content: promptDraft,
    };

    try {
      await this.chatClient.sendMessage({
        chatSessionId: session.id,
        input: userInput,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process chat ${session.id} on model ${modelId}:`,
        error,
      );
      this.busyModels.delete(modelId);
      await this.updateSessionState(session, "queued");
      this.tryRunNext(modelId);
    }
  }

  private async updateSessionState(
    session: ChatSessionData,
    state: ChatSessionData["state"],
  ): Promise<void> {
    if (session.state === state) {
      return;
    }

    const updatedSession: ChatSessionData = {
      ...session,
      state,
      updatedAt: new Date(),
    };

    await this.chatSessionRepository.update(updatedSession);
  }

  private async removeQueueItemForChat(chatId: string): Promise<void> {
    const items = await this.chatQueueRepository.getAllItems();
    const match = items.find((item) => item.chatId === chatId);
    if (!match) {
      return;
    }

    await this.chatQueueRepository.removeItem(match.absoluteFilePath);
  }
}
