// tests/chat-queue-manager.test.ts
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BaseEvent,
  EventHandler,
  IEventBus,
} from "../src/core/event-bus.js";
import { ChatQueueRepository } from "../src/core/services/chat/queue/chat-queue-repository.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../src/core/services/chat/chat-session-repository.js";
import type { ChatUpdatedEvent } from "../src/core/services/chat-engine/events.js";
import {
  ChatQueueManager,
  type ChatMessageSender,
} from "../src/core/services/chat/queue/chat-queue-manager.js";

class InMemoryChatSessionRepository implements ChatSessionRepository {
  private readonly sessions = new Map<string, ChatSessionData>();

  constructor(initialSessions: ChatSessionData[]) {
    for (const session of initialSessions) {
      this.sessions.set(session.id, this.clone(session));
    }
  }

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

  async findByScriptPath(): Promise<ChatSessionData | null> {
    return null;
  }

  async findByScriptHash(): Promise<ChatSessionData[]> {
    return [];
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
      scriptModifiedAt: session.scriptModifiedAt
        ? new Date(session.scriptModifiedAt)
        : null,
    };
  }
}

class TestEventBus implements IEventBus {
  private readonly handlers = new Map<string, Set<EventHandler<BaseEvent>>>();

  subscribe<T extends BaseEvent>(
    eventKind: string,
    handler: EventHandler<T>,
  ): () => void {
    const list = this.handlers.get(eventKind) ?? new Set();
    list.add(handler as EventHandler<BaseEvent>);
    this.handlers.set(eventKind, list);
    return () => this.unsubscribe(eventKind, handler);
  }

  unsubscribe<T extends BaseEvent>(
    eventKind: string,
    handler: EventHandler<T>,
  ): void {
    const list = this.handlers.get(eventKind);
    if (!list) {
      return;
    }
    list.delete(handler as EventHandler<BaseEvent>);
    if (list.size === 0) {
      this.handlers.delete(eventKind);
    }
  }

  async emit<T extends BaseEvent>(event: T): Promise<void> {
    const list = this.handlers.get(event.kind);
    if (!list) {
      return;
    }
    for (const handler of list) {
      await handler(event);
    }
  }

  toIterable<T extends BaseEvent>(): AsyncIterable<[T]> {
    async function* empty(): AsyncGenerator<[T], void, void> {
      return undefined;
    }
    return empty();
  }
}

function createChatSession(options: {
  id: string;
  modelId: `${string}/${string}`;
  promptDraft: string;
}): ChatSessionData {
  const timestamp = new Date();
  return {
    id: options.id,
    sessionType: "chat_engine",
    state: "active",
    messages: [],
    metadata: {
      modelId: options.modelId,
      promptDraft: options.promptDraft,
    },
    scriptPath: null,
    scriptModifiedAt: null,
    scriptHash: null,
    scriptSnapshot: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDeferred() {
  let resolveFn: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: resolveFn!,
  };
}

describe("ChatQueueManager", () => {
  it("processes scheduled chat sessions through the API client", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "chat-queue-manager-"));
    const queueRepository = new ChatQueueRepository(tempDirectory);
    const session = createChatSession({
      id: "chat-1",
      modelId: "openai/gpt-4o",
      promptDraft: "Write tests for the queue manager.",
    });
    const sessionRepository = new InMemoryChatSessionRepository([session]);
    const eventBus = new TestEventBus();

    const firstSend = createDeferred();
    const sendMessageImpl: ChatMessageSender["sendMessage"] = async ({
      chatSessionId,
    }) => {
      const current = await sessionRepository.getById(chatSessionId);
      if (!current) {
        throw new Error(`Missing session ${chatSessionId}`);
      }
      firstSend.resolve();
      return {
        turnResult: {
          state: current.state,
          currentTurn: 1,
        },
        session: current,
      };
    };
    const sendMessage = vi.fn(sendMessageImpl);

    const chatClient: ChatMessageSender = { sendMessage };

    const manager = new ChatQueueManager(
      sessionRepository,
      queueRepository,
      eventBus,
      chatClient,
    );

    const chatFilePath = join(tempDirectory, "chat-1.chat.json");
    await manager.schedule(session.id, chatFilePath);
    await firstSend.promise;

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const call = sendMessage.mock.calls[0]?.[0];
    expect(call?.chatSessionId).toBe(session.id);
    expect(call?.input.content).toBe(session.metadata?.promptDraft);

    const stored = await sessionRepository.getById(session.id);
    expect(stored?.state).toBe("active:generating");

    await queueRepository.close();
    await rm(tempDirectory, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("processes queued chats sequentially when models become available", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "chat-queue-manager-"));
    const queueRepository = new ChatQueueRepository(tempDirectory);
    const sessionA = createChatSession({
      id: "chat-1",
      modelId: "openai/gpt-4o",
      promptDraft: "First prompt",
    });
    const sessionB = createChatSession({
      id: "chat-2",
      modelId: "openai/gpt-4o",
      promptDraft: "Second prompt",
    });
    const sessionRepository = new InMemoryChatSessionRepository([
      sessionA,
      sessionB,
    ]);
    const eventBus = new TestEventBus();

    const firstSend = createDeferred();
    const secondChatProcessed = createDeferred();
    let firstResolved = false;
    const sendMessageImpl: ChatMessageSender["sendMessage"] = async ({
      chatSessionId,
    }) => {
      const current = await sessionRepository.getById(chatSessionId);
      if (!current) {
        throw new Error(`Missing session ${chatSessionId}`);
      }
      if (!firstResolved && chatSessionId === sessionA.id) {
        firstResolved = true;
        firstSend.resolve();
      }
      if (chatSessionId === sessionB.id) {
        secondChatProcessed.resolve();
      }
      return {
        turnResult: {
          state: current.state,
          currentTurn: 1,
        },
        session: current,
      };
    };
    const sendMessage = vi.fn(sendMessageImpl);

    const chatClient: ChatMessageSender = { sendMessage };

    const manager = new ChatQueueManager(
      sessionRepository,
      queueRepository,
      eventBus,
      chatClient,
    );

    await manager.schedule(
      sessionA.id,
      join(tempDirectory, "chat-1.chat.json"),
    );
    await manager.schedule(
      sessionB.id,
      join(tempDirectory, "chat-2.chat.json"),
    );
    await firstSend.promise;

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0].chatSessionId).toBe(sessionA.id);

    const queuedBeforeCompletion = await queueRepository.getAllItems();
    expect(
      queuedBeforeCompletion.find((item) => item.chatId === sessionB.id),
    ).toBeDefined();

    const sessionSnapshot = await sessionRepository.getById(sessionA.id);
    expect(sessionSnapshot).not.toBeNull();

    await eventBus.emit<ChatUpdatedEvent>({
      kind: "ChatUpdatedEvent",
      chatId: sessionA.id,
      updateType: "AI_RESPONSE_COMPLETED",
      update: {},
      chat: sessionSnapshot!,
      timestamp: new Date(),
    });

    await secondChatProcessed.promise;
    expect(sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    const callIds = sendMessage.mock.calls.map(
      (call) => call[0]?.chatSessionId,
    );
    expect(callIds[0]).toBe(sessionA.id);
    expect(callIds.at(-1)).toBe(sessionB.id);
    expect(callIds.filter((id) => id === sessionB.id).length).toBe(1);

    const remainingAfterSecondSend = await queueRepository.getAllItems();
    expect(
      remainingAfterSecondSend.some((item) => item.chatId === sessionA.id),
    ).toBe(false);

    await queueRepository.close();
    await rm(tempDirectory, { recursive: true, force: true });
    vi.clearAllMocks();
  });
});
