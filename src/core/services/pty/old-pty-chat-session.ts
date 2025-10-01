// src/core/services/pty/pty-chat-session.ts
import { Logger, type ILogObj } from "tslog";
import { v4 as uuidv4 } from "uuid";
import type { IEventBus } from "../../event-bus.js";
import type {
  PtyOnDataEvent,
  PtyOnExitEvent,
  PtyWriteEvent,
} from "./events.js";
import type {
  ChatMessage,
  ChatSessionData,
} from "../chat-engine/chat-session-repository.js";
import type { PtyChatUpdatedEvent } from "./events.js";

export type PtyChatUpdateType =
  | "MESSAGE_ADDED"
  | "METADATA_UPDATED"
  | "STATUS_CHANGED";

export interface PtyChatUpdate {
  message?: ChatMessage;
  metadata?: ChatSessionData["metadata"];
  status?: ChatSessionData["sessionStatus"];
}

export class PtyChatSession {
  id: ChatSessionData["id"];
  absoluteFilePath: ChatSessionData["absoluteFilePath"];
  messages: ChatSessionData["messages"] = [];
  modelId: ChatSessionData["modelId"];
  sessionStatus: ChatSessionData["sessionStatus"] = "idle";
  fileStatus: ChatSessionData["fileStatus"] = "active";
  currentTurn: ChatSessionData["currentTurn"] = -1; // not used in pty chat
  maxTurns: ChatSessionData["maxTurns"] = -1; // not used in pty chat
  createdAt: ChatSessionData["createdAt"];
  updatedAt: ChatSessionData["updatedAt"];
  metadata?: ChatSessionData["metadata"];

  private logger: Logger<ILogObj>;
  private activeAssistantMessageId: string | null = null;

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

    this.logger = new Logger({ name: `PtyChatSession-${this.id}` });
  }

  get ptyInstanceId(): string | undefined {
    return this.metadata?.external?.pty?.ptyInstanceId;
  }

  set ptyInstanceId(instanceId: string) {
    // Store in metadata
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata?.external,
        pty: {
          ...this.metadata?.external?.pty,
          ptyInstanceId: instanceId,
        },
      },
    };
  }

  get workingDirectory(): string | undefined {
    return this.metadata?.external?.workingDirectory;
  }

  set workingDirectory(directoryPath: string) {
    // Store in metadata
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata?.external,
        workingDirectory: directoryPath,
      },
    };
  }

  attachPtyInstance(instanceId: string): void {
    if (instanceId === this.ptyInstanceId) {
      this.logger.error("PTY instance already attached");
      return;
    }

    this.logger.info(
      `Attaching PTY instance ${instanceId} to session ${this.id}`,
    );
    this.ptyInstanceId = instanceId;
    this.sessionStatus = "external_active";
    this.subscribeToPtyEvents();

    // this.eventBus.emit("<PtyChatUpdatedEvent>",")
  }

  private subscribeToPtyEvents(): void {
    if (!this.ptyInstanceId) {
      throw new Error("PTY instance not attached");
    }

    this.eventBus.subscribe("PtyOnData", async (event: PtyOnDataEvent) => {
      if (event.sessionId !== this.ptyInstanceId) {
        return;
      }
      await this.handlePtyDataReceived(event.data);
    });

    this.eventBus.subscribe("PtyWrite", async (event: PtyWriteEvent) => {
      if (event.sessionId !== this.ptyInstanceId) {
        return;
      }
      await this.handlePtyWrite(event.data);
    });

    this.eventBus.subscribe("PtyOnExit", async (event: PtyOnExitEvent) => {
      if (event.sessionId !== this.ptyInstanceId) {
        return;
      }
      this.sessionStatus = "external_terminated";
      this.updatedAt = new Date();
      this.logger.info(`PTY session ${this.ptyInstanceId} exited.`);
      this.eventBus.emit<PtyChatUpdatedEvent>({
        kind: "PtyChatUpdatedEvent",
        timestamp: new Date(),
        sessionId: this.id,
        updateType: "STATUS_CHANGED",
        update: { status: this.sessionStatus },
        session: this,
      });
    });
  }

  private async handlePtyWrite(data: string): Promise<void> {
    const message: ChatMessage = {
      id: uuidv4(),
      metadata: {
        timestamp: new Date(),
      },
      message: {
        role: "user",
        content: data,
      },
    };

    this.messages.push(message);
    this.currentTurn += 1;
    this.updatedAt = new Date();
    this.activeAssistantMessageId = null;

    this.eventBus.emit({
      kind: "PtyChatUpdatedEvent",
      timestamp: new Date(),
      sessionId: this.id,
      updateType: "MESSAGE_ADDED",
      update: { message },
      session: this,
    } as PtyChatUpdatedEvent);
  }

  private async handlePtyDataReceived(data: string): Promise<void> {
    if (!data) {
      return;
    }

    let message: ChatMessage | undefined;
    if (this.activeAssistantMessageId) {
      message = this.messages.find(
        (msg) => msg.id === this.activeAssistantMessageId,
      );
    }

    if (!message || message.message.role !== "assistant") {
      message = {
        id: uuidv4(),
        metadata: {
          timestamp: new Date(),
        },
        message: {
          role: "assistant",
          content: data,
        },
      };
      this.messages.push(message);
      this.activeAssistantMessageId = message.id;
      this.currentTurn += 1;
    } else {
      const currentContent = message.message.content;
      if (Array.isArray(currentContent)) {
        currentContent.push({ type: "text", text: data });
      } else if (typeof currentContent === "string") {
        message.message.content = currentContent + data;
      } else {
        message.message.content = data;
      }
      message.metadata.timestamp = new Date();
    }

    this.updatedAt = new Date();

    this.eventBus.emit<PtyChatUpdatedEvent>({
      kind: "PtyChatUpdatedEvent",
      timestamp: new Date(),
      sessionId: this.id,
      updateType: "MESSAGE_ADDED",
      update: { message },
      session: this,
    });
  }

  toJSON(): ChatSessionData {
    return {
      _type: "pty_chat",
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
