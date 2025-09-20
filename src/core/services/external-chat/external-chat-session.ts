// src/core/services/external-chat/external-chat-session.ts
import { v4 as uuidv4 } from "uuid";
import { Logger, type ILogObj } from "tslog";
import type { UserModelMessage } from "ai";
import {
  extractChatFileReferences,
  getUserModelMessageContentString,
} from "../../utils/message-utils.js";
import {
  launchTerminalFromConfig,
  getCommandForModel,
} from "../terminal-launcher.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMessage,
  ChatSessionData,
} from "../chat-engine/chat-session-repository.js";
import type { ProjectFolderService } from "../project-folder-service.js";

export interface ExternalTurnResult {
  sessionStatus: ChatSessionData["sessionStatus"];
  currentTurn: number;
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
    private readonly projectFolderService: ProjectFolderService,
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

      // 2. Check if the external process needs to be started
      const needsToStart = !this.metadata?.external?.pid;

      if (needsToStart) {
        await this._launchExternalTerminal();
      }

      // 3. Write input to the correct process
      this.logger.warn(
        "Writing input to an external terminal is not supported. Please interact with the spawned terminal window directly.",
      );

      // Emit status change event if it was changed
      if (this.sessionStatus !== "processing") {
        await this.eventBus.emit({
          kind: "ChatUpdatedEvent",
          chatId: this.id,
          updateType: "STATUS_CHANGED",
          update: { status: this.sessionStatus },
          chat: this.toJSON(),
          timestamp: new Date(),
        });
      }

      return {
        sessionStatus: this.sessionStatus,
        currentTurn: this.currentTurn,
      };
    } catch (error) {
      this.sessionStatus = "idle";
      throw error;
    } finally {
      if (this.sessionStatus === "processing") {
        this.sessionStatus = "idle";
      }
    }
  }

  async terminateExternal(): Promise<void> {
    const externalMeta = this.metadata?.external;
    if (externalMeta?.mode === "terminal" && externalMeta.pid) {
      try {
        process.kill(externalMeta.pid);
      } catch (e) {
        this.logger.error(
          `Failed to kill external terminal process ${externalMeta.pid}`,
          e,
        );
      }
    }

    if (this.metadata?.external) {
      this.metadata.external.pid = undefined;
    }

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

  private async _launchExternalTerminal(): Promise<void> {
    const projectFolder =
      await this.projectFolderService.getProjectFolderForPath(
        this.absoluteFilePath,
      );

    if (!projectFolder) {
      throw new Error(
        `Chat file ${this.absoluteFilePath} is not within any project folder`,
      );
    }

    const workingDirectory = projectFolder.path;

    const launchResult = launchTerminalFromConfig({
      modelId: this.modelId,
      workingDirectory,
    });

    if (!launchResult.success) {
      throw new Error(`Failed to launch terminal: ${launchResult.error}`);
    }

    this.metadata ??= {};
    this.metadata.external = {
      ...this.metadata?.external,
      pid: launchResult.pid,
      workingDirectory,
    };

    this.sessionStatus = "external_active";
  }
}
