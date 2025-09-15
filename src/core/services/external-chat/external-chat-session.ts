// src/core/services/external-chat/external-chat-session.ts
import { v4 as uuidv4 } from "uuid";
import { Logger, type ILogObj } from "tslog";
import type { UserModelMessage } from "ai";
import {
  extractChatFileReferences,
  getUserModelMessageContentString,
} from "../../utils/message-utils.js";
import { launchTerminalFromConfig } from "../terminal-launcher.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMessage,
  ChatSessionData,
} from "../chat-engine/chat-session-repository.js";

export interface ExternalTurnResult {
  sessionStatus: ChatSessionData["sessionStatus"];
  currentTurn: number;
  externalProcessPid?: number;
}

export class ExternalChatSession {
  id: ChatSessionData["id"];
  absoluteFilePath: ChatSessionData["absoluteFilePath"];
  messages: ChatSessionData["messages"] = [];
  modelId: ChatSessionData["modelId"];
  sessionStatus: ChatSessionData["sessionStatus"] = "idle";
  fileStatus: ChatSessionData["fileStatus"] = "active";
  currentTurn: ChatSessionData["currentTurn"] = 0;
  maxTurns: ChatSessionData["maxTurns"] = 20;
  createdAt: ChatSessionData["createdAt"];
  updatedAt: ChatSessionData["updatedAt"];
  metadata?: ChatSessionData["metadata"];

  private logger: Logger<ILogObj> = new Logger({ name: "ExternalChatSession" });

  constructor(
    data: ChatSessionData,
    private readonly eventBus: IEventBus,
  ) {
    this.id = data.id;
    this.absoluteFilePath = data.absoluteFilePath;
    this.messages = data.messages;
    this.modelId = data.modelId;
    this.sessionStatus = data.sessionStatus;
    this.fileStatus = data.fileStatus;
    this.currentTurn = data.currentTurn;
    this.maxTurns = data.maxTurns;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.metadata = data.metadata;
  }

  async sendToExternal(input: UserModelMessage): Promise<ExternalTurnResult> {
    if (this.currentTurn >= this.maxTurns) {
      this.sessionStatus = "external_terminated";
      return {
        sessionStatus: this.sessionStatus,
        currentTurn: this.currentTurn,
      };
    }

    try {
      this.sessionStatus = "processing";

      // 1. Process and save user message
      const textContent = getUserModelMessageContentString(input);
      const fileReferences = extractChatFileReferences(textContent);

      const message: ChatMessage = {
        id: uuidv4(),
        metadata: {
          timestamp: new Date(),
          fileReferences:
            fileReferences.length > 0 ? fileReferences : undefined,
        },
        message: input,
      };

      this.messages.push(message);
      this.currentTurn += 1;
      this.updatedAt = new Date();

      // Emit message added event
      await this.eventBus.emit({
        kind: "ChatUpdatedEvent",
        chatId: this.id,
        updateType: "MESSAGE_ADDED",
        update: { message },
        chat: this.toJSON(),
        timestamp: new Date(),
      });

      // 2. Launch external terminal if not already active
      if (this.metadata?.externalProcessPid === undefined) {
        const workingDirectory = this.absoluteFilePath.substring(
          0,
          this.absoluteFilePath.lastIndexOf("/"),
        );

        const launchResult = launchTerminalFromConfig({
          modelId: this.modelId,
          workingDirectory,
        });

        if (!launchResult.success) {
          throw new Error(`Failed to launch terminal: ${launchResult.error}`);
        }

        // Update metadata with process info
        this.metadata = {
          ...this.metadata,
          mode: "external",
          externalProcessPid: launchResult.pid,
          externalWorkingDirectory: workingDirectory,
        };

        this.sessionStatus = "external_active";
      }

      // Emit status change event
      await this.eventBus.emit({
        kind: "ChatUpdatedEvent",
        chatId: this.id,
        updateType: "STATUS_CHANGED",
        update: { status: this.sessionStatus },
        chat: this.toJSON(),
        timestamp: new Date(),
      });

      return {
        sessionStatus: this.sessionStatus,
        currentTurn: this.currentTurn,
        externalProcessPid: this.metadata?.externalProcessPid,
      };
    } catch (error) {
      throw error;
    } finally {
      this.sessionStatus = "idle";
    }
  }

  async terminateExternal(): Promise<void> {
    // Future: implement process termination logic
    this.sessionStatus = "external_terminated";
    this.updatedAt = new Date();

    await this.eventBus.emit({
      kind: "ChatUpdatedEvent",
      chatId: this.id,
      updateType: "STATUS_CHANGED",
      update: { status: this.sessionStatus },
      chat: this.toJSON(),
      timestamp: new Date(),
    });
  }

  async cleanup(): Promise<void> {
    if (this.sessionStatus === "external_active") {
      await this.terminateExternal();
    }
  }

  toJSON(): ChatSessionData {
    return {
      _type: "external_chat",
      id: this.id,
      absoluteFilePath: this.absoluteFilePath,
      messages: this.messages,
      modelId: this.modelId,
      sessionStatus: this.sessionStatus,
      fileStatus: this.fileStatus,
      currentTurn: this.currentTurn,
      maxTurns: this.maxTurns,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata,
    };
  }
}
