// src/core/services/external-chat/web-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import { Logger } from "tslog";
import type { ModelMessage } from "ai";
import { parseModelId } from "../../utils/model-utils-v2.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMessage,
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
  ChatState,
} from "../chat/chat-session-repository.js";
import type { ChatUpdatedEvent } from "../chat-engine/events.js";
import {
  type IExternalChatClient,
  type CreateExternalSessionInput,
} from "./external-chat-client.interface.js";
import { ExternalChatSession } from "./external-chat-session.js";
import type {
  AiAssistantId,
  ChatMessage as AutomatorChatMessage,
  ChatPage,
  ChatStatus,
} from "./automators-v2.js";
import {
  type PageUpdatePayload,
  type IWebAutomatorBridge,
} from "./web-automator-bridge.js";
import type { ConnectionStatus } from "./websocket-protocol.js";

const logger = new Logger({ name: "WebChatClient" });

const PROVIDER_TO_ASSISTANT: Record<string, AiAssistantId> = {
  chatgpt: "chatgpt",
  claude: "claude",
  gemini: "gemini",
  grok: "grok",
};

export class WebChatClient implements IExternalChatClient {
  private readonly sessions = new Map<string, ExternalChatSession>();
  private readonly webChatIdToSessionId = new Map<string, string>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
    private readonly automatorBridge: IWebAutomatorBridge,
  ) {
    this.automatorBridge.onPageUpdate((payload) => {
      void this.handlePageUpdate(payload);
    });
    this.automatorBridge.onStatus((status) => {
      void this.handleConnectionStatus(status);
    });
    this.automatorBridge.onError((error) => {
      logger.error("Web automator bridge error", error);
    });
  }

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

    const assistantId = this.resolveAssistantId(parsed.provider);
    const metadata: ChatMetadata = {
      ...input.metadata,
      title: input.title ?? input.metadata?.title ?? "Web Chat Session",
      modelId: input.modelId,
      modelSurface: parsed.surface,
      mode: "agent",
      external: {
        ...input.metadata?.external,
      },
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
    this.syncWebChatIdMapping(sessionData);

    const trimmedPrompt = input.initialPrompt?.trim() ?? "";
    if (trimmedPrompt.length > 0) {
      await this.submitInitialPrompt(session, assistantId, {
        prompt: trimmedPrompt,
        modelId: parsed.providerModelId,
        chatId: metadata.external?.webChatId ?? undefined,
      });
    }

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

  private async submitInitialPrompt(
    session: ExternalChatSession,
    assistantId: AiAssistantId,
    input: { prompt: string; modelId?: string; chatId?: string },
  ): Promise<void> {
    const result = await this.automatorBridge.submitPrompt({
      assistantId,
      input,
    });
    await this.updateSessionWebChatId(session, result.chatId);
  }

  private async handlePageUpdate(payload: PageUpdatePayload): Promise<void> {
    const { page } = payload.event;
    if (page.slug !== "chat-page") {
      return;
    }

    const session = await this.getSessionByWebChatId(page.chatId);
    if (!session) {
      logger.warn(
        `Received page update for unknown web chat ${page.chatId}. Ignoring.`,
      );
      return;
    }

    await this.applyChatPageUpdate(session, page);
  }

  private async handleConnectionStatus(
    status: ConnectionStatus,
  ): Promise<void> {
    if (status.status === "closed" || status.status === "error") {
      await this.updateAllSessionsState("active:disconnected", (state) =>
        state.startsWith("active"),
      );
      return;
    }
    if (status.status === "open") {
      await this.updateAllSessionsState(
        "active",
        (state) => state === "active:disconnected",
      );
    }
  }

  private async updateAllSessionsState(
    nextState: ChatState,
    predicate: (state: ChatState) => boolean,
  ): Promise<void> {
    const updates: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      const snapshot = session.toJSON();
      if (!predicate(snapshot.state)) {
        continue;
      }
      const updated: ChatSessionData = {
        ...snapshot,
        state: nextState,
        updatedAt: new Date(),
      };
      session.replace(updated);
      updates.push(
        this.repository
          .update(updated)
          .then(() =>
            this.emitChatUpdated(updated, "STATUS_CHANGED", {
              state: nextState,
            }),
          )
          .catch((error) => {
            logger.error("Failed to update chat state after WS status", error);
          }),
      );
    }
    await Promise.all(updates);
  }

  private async applyChatPageUpdate(
    session: ExternalChatSession,
    page: ChatPage,
  ): Promise<void> {
    const snapshot = session.toJSON();
    const mergeResult = this.mergeMessages(snapshot.messages, page.messages);
    const metadataUpdate = this.buildMetadataFromPage(snapshot.metadata, page);
    const nextState = this.mapChatStatusToState(page.status);

    const updates: Partial<ChatSessionData> = {};
    if (mergeResult.newMessages.length > 0) {
      updates.messages = mergeResult.messages;
    }
    if (metadataUpdate.changed) {
      updates.metadata = metadataUpdate.metadata;
    }
    if (nextState && nextState !== snapshot.state) {
      updates.state = nextState;
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    const updatedSession: ChatSessionData = {
      ...snapshot,
      ...updates,
      updatedAt: new Date(),
    };

    session.replace(updatedSession);
    await this.repository.update(updatedSession);
    this.syncWebChatIdMapping(updatedSession);

    if (mergeResult.newMessages.length > 0) {
      for (const message of mergeResult.newMessages) {
        await this.emitChatUpdated(updatedSession, "MESSAGE_ADDED", {
          message,
        });
      }
    }

    if (metadataUpdate.changed) {
      await this.emitChatUpdated(updatedSession, "METADATA_UPDATED", {
        metadata: updatedSession.metadata,
      });
    }

    if (updates.state) {
      await this.emitChatUpdated(updatedSession, "STATUS_CHANGED", {
        state: updates.state,
      });
    }
  }

  private mergeMessages(
    existing: ChatMessage[],
    remoteMessages: readonly AutomatorChatMessage[],
  ): {
    messages: ChatMessage[];
    newMessages: ChatMessage[];
  } {
    const existingIds = new Set(existing.map((message) => message.id));
    const newMessages: ChatMessage[] = [];

    for (const remote of remoteMessages) {
      if (!remote.id || existingIds.has(remote.id)) {
        continue;
      }
      const transformed = this.transformRemoteMessage(remote);
      newMessages.push(transformed);
    }

    if (newMessages.length === 0) {
      return { messages: existing, newMessages };
    }

    return {
      messages: [...existing, ...newMessages],
      newMessages,
    };
  }

  private transformRemoteMessage(message: AutomatorChatMessage): ChatMessage {
    const role = this.mapAutomatorRoleToModelRole(message.role);
    const modelMessage: ModelMessage =
      role === "user"
        ? { role: "user", content: message.content }
        : role === "assistant"
          ? { role: "assistant", content: message.content }
          : { role: "system", content: message.content };

    return {
      id: message.id,
      message: modelMessage,
      metadata: {
        timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
      },
    };
  }

  private mapAutomatorRoleToModelRole(
    role: AutomatorChatMessage["role"],
  ): "system" | "user" | "assistant" {
    if (role === "assistant" || role === "user") {
      return role;
    }
    return "system";
  }

  private buildMetadataFromPage(
    metadata: ChatMetadata | undefined,
    page: ChatPage,
  ): { metadata: ChatMetadata; changed: boolean } {
    const nextMetadata: ChatMetadata = {
      ...(metadata ?? {}),
      external: {
        ...(metadata?.external ?? {}),
      },
    };

    let changed = false;

    if (page.title && nextMetadata.title !== page.title) {
      nextMetadata.title = page.title;
      changed = true;
    }

    const prevExternal = metadata?.external;
    const external = {
      ...(nextMetadata.external ?? {}),
      webChatId: page.chatId,
      windowTitle: page.title,
    };

    if (
      prevExternal?.webChatId !== external.webChatId ||
      prevExternal?.windowTitle !== external.windowTitle
    ) {
      changed = true;
    }

    nextMetadata.external = external;
    return { metadata: nextMetadata, changed };
  }

  private mapChatStatusToState(status: ChatStatus): ChatState | null {
    switch (status) {
      case "idle":
        return "active";
      case "generating":
        return "active:generating";
      case "error":
        return "active:awaiting_input";
      default:
        return null;
    }
  }

  private async updateSessionWebChatId(
    session: ExternalChatSession,
    webChatId: string,
  ): Promise<void> {
    const snapshot = session.toJSON();
    const metadata: ChatMetadata = {
      ...(snapshot.metadata ?? {}),
      external: {
        ...(snapshot.metadata?.external ?? {}),
        webChatId,
      },
    };

    const updated: ChatSessionData = {
      ...snapshot,
      metadata,
      updatedAt: new Date(),
    };

    session.replace(updated);
    await this.repository.update(updated);
    this.syncWebChatIdMapping(updated);

    await this.emitChatUpdated(updated, "METADATA_UPDATED", {
      metadata: updated.metadata,
    });
  }

  private syncWebChatIdMapping(session: ChatSessionData): void {
    const webChatId = session.metadata?.external?.webChatId;
    if (webChatId) {
      this.webChatIdToSessionId.set(webChatId, session.id);
    }
  }

  private async emitChatUpdated(
    chat: ChatSessionData,
    updateType: ChatUpdatedEvent["updateType"],
    update: ChatUpdatedEvent["update"],
  ): Promise<void> {
    const event: ChatUpdatedEvent = {
      kind: "ChatUpdatedEvent",
      chatId: chat.id,
      updateType,
      update,
      chat,
      timestamp: new Date(),
    };
    await this.eventBus.emit(event);
  }

  private resolveAssistantId(provider: string): AiAssistantId {
    const assistant = PROVIDER_TO_ASSISTANT[provider];
    if (!assistant) {
      throw new Error(
        `Unsupported web assistant provider "${provider}". Expected one of: ${Object.keys(PROVIDER_TO_ASSISTANT).join(", ")}`,
      );
    }
    return assistant;
  }

  private async getSessionByWebChatId(
    webChatId: string,
  ): Promise<ExternalChatSession | null> {
    const cachedId = this.webChatIdToSessionId.get(webChatId);
    if (cachedId) {
      return this.getOrLoadSession(cachedId);
    }

    // TODO: This O(n) iteration is inefficient. The cache should be populated when sessions
    // are loaded. Consider either: (1) eagerly loading all sessions on init and populating
    // the cache, or (2) using a database index/query to find by webChatId directly.
    for (const [sessionId, session] of this.sessions.entries()) {
      const metadata = session.getMetadata();
      if (metadata?.external?.webChatId === webChatId) {
        this.webChatIdToSessionId.set(webChatId, sessionId);
        return session;
      }
    }

    const allSessions = await this.repository.list();
    const match = allSessions.find(
      (item) => item.metadata?.external?.webChatId === webChatId,
    );
    if (!match) {
      return null;
    }

    const session = new ExternalChatSession(match, this.eventBus);
    this.sessions.set(match.id, session);
    this.syncWebChatIdMapping(match);
    return session;
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
    this.syncWebChatIdMapping(data);
    return session;
  }
}
