// tests/chat-router.test.ts
import { describe, it, expect, vi } from "vitest";
import { createChatRouter } from "../src/core/server/routers/chat-router.js";
import type { ChatSessionData } from "../src/core/services/chat/chat-session-repository.js";
import type { CreateChatSessionInput } from "../src/core/services/chat-engine/api-chat-client.js";

function createSessionStub(
  overrides: Partial<ChatSessionData>,
): ChatSessionData {
  const now = new Date();
  return {
    id: "session-id",
    modelSurface: "api",
    state: "active",
    messages: [],
    metadata: { modelId: "openai/gpt-4o" },
    scriptPath: null,
    scriptModifiedAt: null,
    scriptHash: null,
    scriptSnapshot: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("chat router createSession", () => {
  it("routes cli/* models to the terminal chat client", async () => {
    const apiChatClient = {
      createSession: vi.fn<
        (input: CreateChatSessionInput) => Promise<ChatSessionData>
      >(),
    };
    const terminalChatClient = {
      createSession: vi.fn().mockResolvedValue(
        createSessionStub({
          modelSurface: "terminal",
          metadata: { modelId: "cli/debug", modelSurface: "terminal" },
        }),
      ),
    };
    const webChatClient = {
      createSession: vi.fn(),
    };

    const router = createChatRouter({
      apiChatClient: apiChatClient as any,
      terminalChatClient: terminalChatClient as any,
      webChatClient: webChatClient as any,
    });
    const caller = router.createCaller({});

    const result = await caller.createSession({
      modelId: "cli/debug",
      title: "Terminal Session",
      workingDirectory: "/tmp/project",
    });

    expect(result.sessionType).toBe("external_chat");
    expect(terminalChatClient.createSession).toHaveBeenCalledWith({
      modelId: "cli/debug",
      title: "Terminal Session",
      workingDirectory: "/tmp/project",
      metadata: undefined,
      script: undefined,
    });
    expect(webChatClient.createSession).not.toHaveBeenCalled();
    expect(apiChatClient.createSession).not.toHaveBeenCalled();
  });

  it("throws when cli/* session is missing working directory", async () => {
    const router = createChatRouter({
      apiChatClient: { createSession: vi.fn() } as any,
      terminalChatClient: { createSession: vi.fn() } as any,
      webChatClient: { createSession: vi.fn() } as any,
    });
    const caller = router.createCaller({});

    await expect(
      caller.createSession({
        modelId: "cli/debug",
        title: "No directory",
      }),
    ).rejects.toThrow("Terminal chats require a working directory");
  });

  it("routes web/* models to the web chat client", async () => {
    const apiChatClient = {
      createSession: vi.fn(),
    };
    const terminalChatClient = {
      createSession: vi.fn(),
    };
    const webChatClient = {
      createSession: vi.fn().mockResolvedValue(
        createSessionStub({
          modelSurface: "terminal",
          metadata: { modelId: "web/gpt-5", modelSurface: "web" },
        }),
      ),
    };

    const router = createChatRouter({
      apiChatClient: apiChatClient as any,
      terminalChatClient: terminalChatClient as any,
      webChatClient: webChatClient as any,
    });
    const caller = router.createCaller({});

    const result = await caller.createSession({
      modelId: "web/gpt-5",
      title: "Browser Session",
    });

    expect(result.metadata?.modelSurface).toBe("web");
    expect(webChatClient.createSession).toHaveBeenCalledWith({
      modelId: "web/gpt-5",
      title: "Browser Session",
      metadata: undefined,
      script: undefined,
    });
    expect(apiChatClient.createSession).not.toHaveBeenCalled();
    expect(terminalChatClient.createSession).not.toHaveBeenCalled();
  });

  it("routes other models to the API chat client", async () => {
    const apiChatClient = {
      createSession: vi.fn().mockResolvedValue(
        createSessionStub({
          modelSurface: "api",
          metadata: { modelId: "openai/gpt-4o" },
        }),
      ),
    };
    const terminalChatClient = { createSession: vi.fn() };
    const webChatClient = { createSession: vi.fn() };

    const router = createChatRouter({
      apiChatClient: apiChatClient as any,
      terminalChatClient: terminalChatClient as any,
      webChatClient: webChatClient as any,
    });
    const caller = router.createCaller({});

    const result = await caller.createSession({
      modelId: "openai/gpt-4o",
      title: "Standard Session",
      script: {
        path: "/tmp/script.md",
        snapshot: "hello",
      },
    });

    expect(result.sessionType).toBe("api");
    expect(apiChatClient.createSession).toHaveBeenCalledWith({
      modelSurface: "api",
      metadata: {
        modelId: "openai/gpt-4o",
        modelSurface: "api",
        title: "Standard Session",
      },
      script: {
        path: "/tmp/script.md",
        snapshot: "hello",
      },
    });
    expect(terminalChatClient.createSession).not.toHaveBeenCalled();
    expect(webChatClient.createSession).not.toHaveBeenCalled();
  });
});
