// src/core/services/external-chat/app-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import { Logger } from "tslog";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import {
  type IExternalChatClient,
  type CreateExternalSessionInput,
} from "./external-chat-client.interface.js";

import { ExternalChatSession } from "./external-chat-session.js";

const logger = new Logger({ name: "AppChatClient" });

export class AppChatClient implements IExternalChatClient {
  private readonly sessions = new Map<string, ExternalChatSession>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
  ) {}

  async createSession(
    input: CreateExternalSessionInput,
  ): Promise<ChatSessionData> {
    logger.info("Creating a tracking session for an app chat...");
    const timestamp = new Date();
    const sessionData: ChatSessionData = {
      id: uuidv4(),
      sessionType: "external_chat",
      state: "active",
      messages: [],
      metadata: {
        title: input.title || "App Chat Session",
        modelId: input.modelId,
        mode: "agent",
        external: {
          mode: "app",
        },
        ...input.metadata,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      scriptPath: null,
      scriptHash: null,
      scriptSnapshot: null,
      scriptModifiedAt: null,
    };

    await this.repository.create(sessionData);
    const session = new ExternalChatSession(sessionData, this.eventBus);
    this.sessions.set(session.id, session);

    return session.toJSON();
  }

  async terminateSession(sessionId: string): Promise<ChatSessionData> {
    const session = await this.getOrLoadSession(sessionId);

    session.terminate();

    const updatedData = session.toJSON();
    await this.repository.update(updatedData);
    this.sessions.delete(sessionId);

    return updatedData;
  }

  private async getOrLoadSession(
    sessionId: string,
  ): Promise<ExternalChatSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const data = await this.repository.getById(sessionId);
    if (!data) {
      throw new Error(`App session ${sessionId} not found`);
    }
    const session = new ExternalChatSession(data, this.eventBus);
    this.sessions.set(sessionId, session);
    return session;
  }
}
