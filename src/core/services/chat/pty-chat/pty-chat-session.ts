// src/core/services/chat/pty-chat/pty-chat-session.ts
import { v4 as uuidv4 } from "uuid";
import type { IEventBus } from "../../../event-bus.js";
import type {
  ChatMessage,
  ChatMessageMetadata,
  ChatMetadata,
  ChatSessionData,
  ChatState,
} from "../chat-session-repository.js";
import type { PtyChatUpdatedEvent } from "./events.js";
import { extractMessages } from "./universal-snapshot-extractor.js";
import { findSimilarMessageIndex } from "./pty-message-matcher.js";

export type PtyChatUpdateType =
  | "MESSAGE_ADDED"
  | "METADATA_UPDATED"
  | "STATUS_CHANGED";

export interface PtyChatUpdate {
  message?: ChatMessage;
  metadata?: ChatMetadata;
  state?: ChatState;
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
  private state: ChatState;
  private readonly createdAt: Date;
  private updatedAt: Date;

  // Script-related fields
  private scriptPath: string | null;
  private scriptModifiedAt: Date | null;
  private scriptHash: string | null;
  private scriptSnapshot: string | null;

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
    this.state = data.state;
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt);

    // Initialize script-related fields
    this.scriptPath = data.scriptPath ?? null;
    this.scriptModifiedAt = data.scriptModifiedAt
      ? new Date(data.scriptModifiedAt)
      : null;
    this.scriptHash = data.scriptHash ?? null;
    this.scriptSnapshot = data.scriptSnapshot ?? null;
  }

  get chatState(): ChatState {
    return this.state;
  }

  set chatState(newState: ChatState) {
    this.state = newState;
  }

  get ptyInstanceId(): string | undefined {
    return this.metadata.external?.ptyInstanceId;
  }

  set ptyInstanceId(value: string | undefined) {
    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata.external,
        ptyInstanceId: value,
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

  updateFromSnapshot(snapshot: string): void {
    const newMessages = extractMessages(snapshot);
    if (newMessages.length === 0) {
      return;
    }

    // Find anchor point for merging
    let anchorIndex = -1;
    let newMessagesAnchorIndex = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const currentMessage = this.messages[i];
      const foundIndex = findSimilarMessageIndex(currentMessage, newMessages);
      if (foundIndex !== -1) {
        anchorIndex = i;
        newMessagesAnchorIndex = foundIndex;
        break;
      }
    }

    if (anchorIndex !== -1 && newMessagesAnchorIndex !== -1) {
      // Anchor found, merge the lists
      const newSlice = newMessages.slice(newMessagesAnchorIndex + 1);
      this.messages.splice(anchorIndex + 1);
      this.messages.push(...newSlice);
    } else {
      // No anchor, likely a screen clear. Append all new messages.
      this.messages.push(...newMessages);
    }

    this.metadata = {
      ...this.metadata,
      external: {
        ...this.metadata.external,
      },
    };
    this.updatedAt = new Date();
    void this.emitUpdate("MESSAGE_ADDED", {});
  }

  markTerminated(): void {
    this.state = "terminated";
    this.updatedAt = new Date();
    void this.emitUpdate("STATUS_CHANGED", { state: this.state });
  }

  recordCliEvent(
    type: "screenRefresh" | "newSession",
    details: Record<string, unknown>,
  ): void {
    const message: ChatMessage = {
      id: uuidv4(),
      message: {
        role: "system",
        content: JSON.stringify({ type, ...details }),
      },
      metadata: {
        timestamp: new Date(),
      },
    };
    this.messages.push(message);
    this.updatedAt = new Date();
    void this.emitUpdate("MESSAGE_ADDED", { message });
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

  toChatSessionData(): ChatSessionData {
    return {
      id: this.id,
      sessionType: "pty_chat",
      state: this.state,
      messages: this.messages.map((message) => ({
        ...message,
        metadata: {
          ...message.metadata,
          timestamp: new Date(message.metadata.timestamp),
        },
      })),
      metadata: structuredClone(this.metadata),
      scriptPath: this.scriptPath,
      scriptModifiedAt: this.scriptModifiedAt,
      scriptHash: this.scriptHash,
      scriptSnapshot: this.scriptSnapshot,
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
