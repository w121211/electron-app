// tests/integration/web-chat-client.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EventBus } from "../../src/core/event-bus.js";
import type { ChatUpdatedEvent } from "../../src/core/services/chat-engine/events.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionRepository,
} from "../../src/core/services/chat/chat-session-repository.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";
import type { ChatPage } from "../../src/core/services/external-chat/automators-v2.js";
import type { PageUpdatePayload } from "../../src/core/services/external-chat/web-automator-bridge.js";
import type { ConnectionStatus } from "../../src/core/services/external-chat/websocket-protocol.js";
import { WebAutomatorBridgeStub } from "../helpers/web-automator-bridge.stub.js";

describe("WebChatClient integration", () => {
  let databasePath: string;
  let repository: ChatSessionRepository;
  let eventBus: EventBus;
  let automatorBridge: WebAutomatorBridgeStub;
  let chatUpdates: ChatUpdatedEvent[];
  let unsubscribe: () => void;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `web-chat-client-${randomUUID()}.db`);
    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });
    eventBus = new EventBus({ environment: "server" });
    automatorBridge = new WebAutomatorBridgeStub();
    chatUpdates = [];
    unsubscribe = eventBus.subscribe<ChatUpdatedEvent>(
      "ChatUpdatedEvent",
      (event) => {
        chatUpdates.push(event);
      },
    );
  });

  afterEach(async () => {
    unsubscribe?.();
    await fs.unlink(databasePath).catch(() => {
      // Ignore cleanup failures on CI
    });
  });

  it(
    "tracks live session updates, message merges, and status changes",
    async () => {
      const webChatClient = new WebChatClient(
        eventBus,
        repository,
        automatorBridge,
      );

      const session = await webChatClient.createSession({
        modelId: "web:chatgpt:gpt-4o-mini",
        title: "Web chat live flow",
        initialPrompt: "   trigger prompt   ",
        metadata: {
          mode: "agent",
        },
      });

      expect(session.metadata?.title).toBe("Web chat live flow");
      expect(session.metadata?.modelSurface).toBe("web");
      expect(session.metadata?.external?.webChatId).toBeDefined();
      expect(automatorBridge.submittedPrompts).toHaveLength(1);
      expect(automatorBridge.submittedPrompts[0]?.assistantId).toBe("chatgpt");
      expect(automatorBridge.submittedPrompts[0]?.input.prompt).toBe(
        "trigger prompt",
      );
      expect(chatUpdates.some((event) => event.updateType === "METADATA_UPDATED"))
        .toBe(true);

      const chatId = session.metadata?.external?.webChatId ?? "unknown-chat";
      const pageEvent: PageUpdatePayload = {
        assistantId: "chatgpt",
        event: {
          timestamp: new Date(),
          page: buildChatPage({
            chatId,
            status: "generating",
            title: "Remote Web Tab",
            messages: [
              {
                id: "remote-message-1",
                role: "assistant",
                content: "Generated content from remote UI.",
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        },
      };

      automatorBridge.emitPageUpdate(pageEvent);
      await waitForExpect(async () => {
        const updated = await repository.getById(session.id);
        expect(updated?.messages).toHaveLength(1);
        expect(updated?.messages[0]?.id).toBe("remote-message-1");
        expect(updated?.metadata?.external?.windowTitle).toBe("Remote Web Tab");
        expect(updated?.state).toBe("active:generating");
      });

      await waitForExpect(() => {
        const sequence = chatUpdates.map((event) => event.updateType);
        expect(sequence).toContain("MESSAGE_ADDED");
        expect(sequence).toContain("METADATA_UPDATED");
        expect(sequence).toContain("STATUS_CHANGED");
      });

      automatorBridge.emitStatus(connectionStatus("closed"));
      await waitForExpect(async () => {
        const disconnected = await repository.getById(session.id);
        expect(disconnected?.state).toBe("active:disconnected");
      });

      automatorBridge.emitStatus(connectionStatus("open"));
      await waitForExpect(async () => {
        const reopened = await repository.getById(session.id);
        expect(reopened?.state).toBe("active");
      });
    },
    10000,
  );

  it(
    "reloads sessions from persistence when receiving page events for cached webChatIds",
    async () => {
      const initialClient = new WebChatClient(
        eventBus,
        repository,
        automatorBridge,
      );

      const session = await initialClient.createSession({
        modelId: "web:chatgpt:gpt-4o-mini",
        title: "Rehydration subject",
        initialPrompt: "persisted prompt",
      });

      const webChatId = session.metadata?.external?.webChatId;
      expect(webChatId).toBeDefined();

      const rehydratedBridge = new WebAutomatorBridgeStub();
      const rehydratedClient = new WebChatClient(
        eventBus,
        repository,
        rehydratedBridge,
      );

      chatUpdates = [];

      const remoteMessages = [
        {
          id: "rehydrated-message-1",
          role: "assistant" as const,
          content: "Synced after restart.",
          createdAt: new Date().toISOString(),
        },
      ];

      rehydratedBridge.emitPageUpdate({
        assistantId: "chatgpt",
        event: {
          timestamp: new Date(),
          page: buildChatPage({
            chatId: webChatId ?? "missing",
            status: "idle",
            title: "Rehydrated Window",
            messages: remoteMessages,
          }),
        },
      });

      await waitForExpect(async () => {
        const updated = await repository.getById(session.id);
        expect(updated?.messages).toHaveLength(1);
        expect(updated?.messages[0]?.id).toBe("rehydrated-message-1");
        expect(updated?.metadata?.external?.windowTitle).toBe(
          "Rehydrated Window",
        );
        expect(updated?.state).toBe("active");
      });

      await waitForExpect(() => {
        expect(chatUpdates.some((event) => event.updateType === "MESSAGE_ADDED"))
          .toBe(true);
      });

      rehydratedBridge.emitStatus(connectionStatus("closed"));
      await waitForExpect(async () => {
        const disconnected = await repository.getById(session.id);
        expect(disconnected?.state).toBe("active:disconnected");
      });

      rehydratedBridge.emitStatus(connectionStatus("open"));
      await waitForExpect(async () => {
        const reopened = await repository.getById(session.id);
        expect(reopened?.state).toBe("active");
      });
    },
    10000,
  );
});

function buildChatPage(
  overrides: Partial<ChatPage> & { chatId: string; status: ChatPage["status"] },
): ChatPage {
  const messages = overrides.messages ?? ([] as ChatPage["messages"]);
  return {
    slug: "chat-page",
    chatId: overrides.chatId,
    status: overrides.status,
    url: overrides.url ?? "https://assistant.local/chat",
    title: overrides.title ?? "Assistant Window",
    isLoggedIn: overrides.isLoggedIn ?? true,
    modelId: overrides.modelId ?? "stub-model",
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    messages,
  };
}

async function waitForExpect(
  assertFn: () => void | Promise<void>,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertFn();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("waitForExpect timed out");
}

function connectionStatus(
  status: ConnectionStatus["status"],
): ConnectionStatus {
  return { status };
}
