// tests/web-chat-client.test.ts
import { describe, expect, it } from "vitest";
import type {
  BaseEvent,
  EventHandler,
  IEventBus,
} from "../../src/core/event-bus.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../../src/core/services/chat/chat-session-repository.js";
import type { ChatUpdatedEvent } from "../../src/core/services/chat-engine/events.js";
import { WebAutomatorBridge } from "../../src/core/services/external-chat/web-automator-bridge.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";
import type {
  ChatMessage,
  ChatPage,
} from "../../src/core/services/external-chat/automators-v2.js";
import type { ExtensionMessage } from "../../src/core/services/external-chat/websocket-protocol.js";
import {
  MockWebSocketServer,
  MockWebSocketClient,
} from "../helpers/mock-websocket.js";

class InMemoryChatSessionRepository implements ChatSessionRepository {
  private readonly sessions = new Map<string, ChatSessionData>();

  async create(session: ChatSessionData): Promise<void> {
    this.sessions.set(session.id, this.clone(session));
  }

  async update(session: ChatSessionData): Promise<void> {
    this.sessions.set(session.id, this.clone(session));
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getById(sessionId: string): Promise<ChatSessionData | null> {
    const session = this.sessions.get(sessionId);
    return session ? this.clone(session) : null;
  }

  async list(): Promise<ChatSessionData[]> {
    return Array.from(this.sessions.values()).map((session) =>
      this.clone(session),
    );
  }

  private clone(session: ChatSessionData): ChatSessionData {
    return {
      ...session,
      metadata: session.metadata ? { ...session.metadata } : undefined,
      messages: session.messages.map((message) => ({
        ...message,
        metadata: { ...message.metadata },
      })),
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    };
  }
}

class TestEventBus implements IEventBus {
  public readonly events: BaseEvent[] = [];

  async emit<T extends BaseEvent>(event: T): Promise<void> {
    this.events.push(event);
  }

  subscribe<T extends BaseEvent>(
    _eventKind: string,
    _handler: EventHandler<T>,
  ): () => void {
    return () => {};
  }

  unsubscribe<T extends BaseEvent>(
    _eventKind: string,
    _handler: EventHandler<T>,
  ): void {}

  toIterable<T extends BaseEvent>(): AsyncIterable<[T]> {
    async function* empty(): AsyncGenerator<[T], void, void> {
      return undefined;
    }
    return empty();
  }
}

function createPageUpdate(message: ChatMessage[]): ExtensionMessage {
  const page: ChatPage = {
    slug: "chat-page",
    chatId: "mock-chat-id",
    status: "generating",
    url: "https://assistant.test/chat/mock-chat-id",
    title: "Mock Chat",
    modelId: "chatgpt-4o",
    messages: message,
    updatedAt: new Date().toISOString(),
    isLoggedIn: true,
  };

  return {
    type: "ws:watch-page-update",
    assistantId: "chatgpt",
    watchId: "watch-1",
    payload: {
      timestamp: new Date(),
      page,
    },
  } satisfies ExtensionMessage;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("WebChatClient", () => {
  async function setup() {
    const server = new MockWebSocketServer();
    const bridge = new WebAutomatorBridge(server as any, {
      defaultAssistant: "chatgpt",
      clientId: "test-client",
    });
    const repository = new InMemoryChatSessionRepository();
    const eventBus = new TestEventBus();
    const client = new WebChatClient(eventBus, repository, bridge);

    const wsClient = server.connect();
    setupPromptResponder(wsClient);

    const session = await client.createSession({
      modelId: "web:chatgpt",
      title: "Browser Chat",
      initialPrompt: "Hello",
      metadata: {
        projectPath: "/tmp/project",
      },
    });

    await flushMicrotasks();

    return { client, repository, eventBus, wsClient, session };
  }

  function setupPromptResponder(wsClient: MockWebSocketClient): void {
    wsClient.onMessage((message) => {
      if (message.type === "ws:submit-prompt") {
        wsClient.send({
          type: "ws:submit-prompt-result",
          assistantId: message.assistant,
          requestId: message.requestId,
          payload: { chatId: "mock-chat-id" },
        });
      }
    });
  }

  it("merges remote messages and emits message events", async () => {
    const { repository, eventBus, wsClient, session } = await setup();

    wsClient.send(
      createPageUpdate([
        {
          id: "msg-1",
          role: "assistant",
          content: "Hello from the browser",
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    await flushMicrotasks();

    const updated = await repository.getById(session.id);
    expect(updated?.messages).toHaveLength(1);
    expect(updated?.messages[0]?.message.role).toBe("assistant");

    const messageEvent = (eventBus.events as ChatUpdatedEvent[]).find(
      (event) =>
        event.kind === "ChatUpdatedEvent" &&
        event.updateType === "MESSAGE_ADDED" &&
        event.chatId === session.id,
    );

    expect(messageEvent).toBeDefined();
    expect(messageEvent?.update.message.id).toBe("msg-1");
  });

  it("updates chat state when automator connection changes", async () => {
    const { repository, wsClient, session } = await setup();

    wsClient.send({
      type: "connection:status",
      payload: { status: "closed" },
    });

    await flushMicrotasks();

    expect((await repository.getById(session.id))?.state).toBe(
      "active:disconnected",
    );

    wsClient.send({
      type: "connection:status",
      payload: { status: "open" },
    });

    await flushMicrotasks();

    expect((await repository.getById(session.id))?.state).toBe("active");
  });
});
