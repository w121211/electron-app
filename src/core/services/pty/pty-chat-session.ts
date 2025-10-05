// src/core/services/pty/pty-chat-session.ts
import { v4 as uuidv4 } from "uuid";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMessage,
  ChatMessageMetadata,
  ChatMetadata,
  ChatSessionData,
  ChatSessionStatus,
} from "../chat/chat-session-repository.js";
import type { PtyChatUpdatedEvent } from "./events.js";
import { extractMessages } from "./pty-chat-snapshot-extractor.js";

export type PtyChatUpdateType =
  | "MESSAGE_ADDED"
  | "METADATA_UPDATED"
  | "STATUS_CHANGED";

export interface PtyChatUpdate {
  message?: ChatMessage;
  metadata?: ChatMetadata;
  status?: ChatSessionStatus;
}

function cloneMetadata(metadata: ChatMetadata | undefined): ChatMetadata {
  if (!metadata) {
    return {};
  }
  return structuredClone(metadata);
}

function normalizeMessageMetadata(
  metadata: ChatMessageMetadata,
): ChatMessageMetadata {
  return {
    ...metadata,
    timestamp: new Date(metadata.timestamp),
  };
}

export class PtyChatSession {
  readonly id: string;
  private readonly eventBus: IEventBus;
  private messages: ChatMessage[];
  private metadata: ChatMetadata;
  private sessionStatus: ChatSessionStatus;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private activeAssistantMessageId: string | null = null;

  constructor(data: ChatSessionData, eventBus: IEventBus) {
    if (data.sessionType !== "pty_chat") {
      throw new Error("PtyChatSession requires a sessionType of 'pty_chat'");
    }

    this.id = data.id;
    this.eventBus = eventBus;
    this.messages = data.messages.map((message) => ({
      ...message,
      metadata: normalizeMessageMetadata(message.metadata),
    }));
    this.metadata = cloneMetadata(data.metadata);
    this.sessionStatus = data.sessionStatus;
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt);
  }

  get status(): ChatSessionStatus {
    return this.sessionStatus;
  }

  set status(newStatus: ChatSessionStatus) {
    this.sessionStatus = newStatus;
  }

  get ptyInstanceId(): string | undefined {
    return this.metadata.external?.pty?.ptyInstanceId;
  }

  set ptyInstanceId(value: string | undefined) {
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata.external,
        pty: {
          ...this.metadata.external?.pty,
          ptyInstanceId: value,
        },
      },
    };
  }

  get workingDirectory(): string | undefined {
    return this.metadata.external?.workingDirectory;
  }

  set workingDirectory(value: string | undefined) {
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata.external,
        workingDirectory: value,
      },
    };
  }

  recordUserInput(data: string): void {
    const message: ChatMessage = {
      id: uuidv4(),
      message: {
        role: "user",
        content: data,
      },
      metadata: {
        timestamp: new Date(),
      },
    };

    this.messages.push(message);
    this.activeAssistantMessageId = null;
    this.updatedAt = new Date();
    void this.emitUpdate("MESSAGE_ADDED", { message });
  }

  recordAssistantOutput(data: string): void {
    if (!data) {
      return;
    }

    if (this.activeAssistantMessageId) {
      const activeMessage = this.messages.find(
        (message) => message.id === this.activeAssistantMessageId,
      );
      if (activeMessage && activeMessage.message.role === "assistant") {
        const previousContent = typeof activeMessage.message.content === "string"
          ? activeMessage.message.content
          : "";
        activeMessage.message = {
          role: "assistant",
          content: previousContent + data,
        };
        this.updatedAt = new Date();
        void this.emitUpdate("MESSAGE_ADDED", { message: activeMessage });
        return;
      }
    }

    const message: ChatMessage = {
      id: uuidv4(),
      message: {
        role: "assistant",
        content: data,
      },
      metadata: {
        timestamp: new Date(),
      },
    };

    this.messages.push(message);
    this.activeAssistantMessageId = message.id;
    this.updatedAt = new Date();
    void this.emitUpdate("MESSAGE_ADDED", { message });
  }

  markTerminated(): void {
    this.sessionStatus = "external_terminated";
    this.updatedAt = new Date();
    void this.emitUpdate("STATUS_CHANGED", { status: this.sessionStatus });
  }

  recordPtyExit(): void {
    if (!this.ptyInstanceId) {
      return;
    }

    this.ptyInstanceId = undefined;
    this.updatedAt = new Date();
    void this.emitUpdate("METADATA_UPDATED", {
      metadata: structuredClone(this.metadata),
    });
  }

  updateMessagesFromSnapshot(snapshot: string): void {
    this.messages = extractMessages(snapshot);
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata.external,
        pty: {
          ...this.metadata.external?.pty,
          snapshot: snapshot,
        },
      },
    };
    this.updatedAt = new Date();
    void this.emitUpdate("MESSAGE_ADDED", {});
  }

  toChatSessionData(): ChatSessionData {
    return {
      id: this.id,
      sessionType: "pty_chat",
      sessionStatus: this.sessionStatus,
      messages: this.messages.map((message) => ({
        ...message,
        metadata: {
          ...message.metadata,
          timestamp: new Date(message.metadata.timestamp),
        },
      })),
      metadata: structuredClone(this.metadata),
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: this.createdAt,
      updatedAt: new Date(this.updatedAt),
    };
  }

  private async emitUpdate(
    updateType: PtyChatUpdateType,
    update: PtyChatUpdate,
  ): Promise<void> {
    const event: PtyChatUpdatedEvent = {
      kind: "PtyChatUpdatedEvent",
      timestamp: new Date(),
      sessionId: this.id,
      updateType,
      update,
      session: this,
    };

    await this.eventBus.emit(event);
  }
}
