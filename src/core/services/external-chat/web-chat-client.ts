// src/core/services/external-chat/web-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import { Logger } from "tslog";
import { parseModelId } from "../../utils/model-utils-v2.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import {
  type IExternalChatClient,
  type CreateExternalSessionInput,
} from "./external-chat-client.interface.js";
import { ExternalChatSession } from "./external-chat-session.js";

const logger = new Logger({ name: "WebChatClient" });

export class WebChatClient implements IExternalChatClient {
  private readonly sessions = new Map<string, ExternalChatSession>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
  ) {}

  async createSession(
    input: CreateExternalSessionInput,
  ): Promise<ChatSessionData> {
    logger.info("Creating a tracking session for a web chat...");
    const timestamp = new Date();
    const parsed = parseModelId(input.modelId);

    if (parsed.surface !== "web") {
      throw new Error(
        `Invalid model ID for WebChatClient: "${input.modelId}". Expected surface "web", got "${parsed.surface}"`,
      );
    }

    const metadata: ChatMetadata = {
      ...input.metadata,
      title: input.title ?? input.metadata?.title ?? "Web Chat Session",
      modelId: input.modelId,
      modelSurface: parsed.surface,
      mode: "agent",
      external: input.metadata?.external,
      promptSnapshot: input.promptSnapshot ?? input.metadata?.promptSnapshot,
    };

    const sessionData: ChatSessionData = {
      id: uuidv4(),
      modelSurface: parsed.surface,
      state: "active",
      messages: [],
      metadata,
      sourcePromptId: input.sourcePromptId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
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
      throw new Error(`Web session ${sessionId} not found`);
    }
    const session = new ExternalChatSession(data, this.eventBus);
    this.sessions.set(sessionId, session);
    return session;
  }
}
