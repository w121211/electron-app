// tests/api-chat-client.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type {
  ModelMessage,
  Tool,
  ToolResultPart,
  ToolSet,
  TypedToolCall,
  UserModelMessage,
} from "ai";
import { z } from "zod";
import {
  ApiChatClient,
  type CreateChatSessionInput,
  type SendChatMessageInput,
} from "../src/core/services/chat-engine/api-chat-client.js";
import {
  ChatSessionRepositoryImpl,
  type ChatMessage,
  type ChatMetadata,
} from "../src/core/services/chat/chat-session-repository.js";
import { EventBus, type IEventBus } from "../src/core/event-bus.js";
import type {
  ToolRegistry,
  ToolsHealthReport,
} from "../src/core/services/tool-call/tool-registry.js";
import type { ToolExecutionResult } from "../src/core/services/tool-call/tool-call-runner.js";

class MockToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  readonly registerTool = vi.fn();
  readonly registerMCPServer = vi.fn(async () => {});

  constructor() {
    const mockTool: Tool = {
      description: "Mock tool",
      inputSchema: z.object({}),
      execute: vi.fn().mockResolvedValue({ result: "mock result" }),
    };

    this.tools.set("test-tool", mockTool);
  }

  getToolSet(toolNames?: string[]): ToolSet {
    const names = toolNames ?? Array.from(this.tools.keys());
    return names.reduce<ToolSet>((accumulator, name) => {
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Tool "${name}" not found`);
      }
      accumulator[name] = tool;
      return accumulator;
    }, {} as ToolSet);
  }

  getToolSetByNames = vi.fn((toolNames: string[]): ToolSet => {
    return this.getToolSet(toolNames);
  });

  isBuiltInTool(name: string): boolean {
    return this.tools.has(name);
  }

  isMCPTool(): boolean {
    return false;
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getMCPTool(): Tool | undefined {
    return undefined;
  }

  getAllTools(): Map<string, Tool> {
    return new Map(this.tools);
  }

  getToolMetadata(): undefined {
    return undefined;
  }

  checkToolsHealth(): ToolsHealthReport {
    return {
      totalTools: this.tools.size,
      healthyTools: this.tools.size,
      unhealthyTools: 0,
      mcpServers: {
        total: 0,
        healthy: 0,
        unhealthy: 0,
      },
      details: new Map(),
    };
  }
}

vi.mock("../src/core/services/tool-call/tool-call-runner.js", () => ({
  ToolCallRunner: class MockToolCallRunner {
    async execute(): Promise<ToolExecutionResult<ToolSet>> {
      const executed: ToolResultPart[] = [
        {
          type: "tool-result",
          toolCallId: "test-tool-call-1",
          toolName: "test-tool",
          input: {},
          output: { result: "Mock tool execution result" },
          dynamic: true,
        },
      ];

      return {
        status: "completed",
        executed,
      } satisfies ToolExecutionResult<ToolSet>;
    }
  },
}));

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn(() => ({ id: "mock-model" })),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    streamText: vi.fn(() => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", text: "Hello" };
          yield { type: "text-delta", text: " world!" };
        },
      };

      return {
        fullStream: mockStream,
        response: Promise.resolve({
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Hello world!",
                },
              ],
            },
          ],
        }),
      };
    }),
  };
});

function createMockUserMessage(content: string): UserModelMessage {
  return {
    role: "user",
    content,
  };
}

function createMockAssistantMessage(content: string): ModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
  };
}

function createMockChatMessage(
  message: ModelMessage,
  timestamp = new Date(),
): ChatMessage {
  return {
    id: uuidv4(),
    message,
    metadata: {
      timestamp,
    },
  };
}

function createPendingToolCall(): TypedToolCall<ToolSet> {
  return {
    type: "tool-call",
    toolCallId: "test-tool-call-1",
    toolName: "test-tool",
    input: {},
    dynamic: true,
  };
}

function extractEventTypes(events: Array<{ updateType: string }>): string[] {
  return events.map((event) => event.updateType);
}

describe("ApiChatClient", () => {
  let client: ApiChatClient;
  let repository: ChatSessionRepositoryImpl;
  let eventBus: IEventBus;
  let toolRegistry: MockToolRegistry;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = `/tmp/api-chat-client-test-${Date.now()}.db`;
    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: tempDbPath,
    });
    eventBus = new EventBus({ environment: "server" });
    toolRegistry = new MockToolRegistry();

    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Database file might not exist, ignore cleanup error
    }
  });

  describe("Session Management", () => {
    it("creates a new chat session", async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          title: "Test Session",
          modelId: "openai/gpt-4o-mini",
          maxTurns: 10,
        },
      };

      const session = await client.createSession(input);

      expect(session.id).toBeDefined();
      expect(session.sessionType).toBe("chat_engine");
      expect(session.state).toBe("active");
      expect(session.metadata?.title).toBe("Test Session");
      expect(session.metadata?.modelId).toBe("openai/gpt-4o-mini");
      expect(session.metadata?.maxTurns).toBe(10);
      expect(session.metadata?.currentTurn).toBe(0);
    });

    it("persists script metadata when provided", async () => {
      const scriptContent = "Write a hello world program";
      const scriptHash = crypto
        .createHash("sha256")
        .update(scriptContent)
        .digest("hex");
      const scriptPath = "/test/script.prompt.md";
      const modifiedAt = new Date();

      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
        script: {
          path: scriptPath,
          modifiedAt,
          hash: scriptHash,
          snapshot: scriptContent,
        },
      };

      const session = await client.createSession(input);

      expect(session.scriptPath).toBe(scriptPath);
      expect(session.scriptModifiedAt?.toISOString()).toBe(
        modifiedAt.toISOString(),
      );
      expect(session.scriptHash).toBe(scriptHash);
      expect(session.scriptSnapshot).toBe(scriptContent);
    });

    it("retrieves an existing session", async () => {
      const created = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          title: "Existing",
          modelId: "openai/gpt-4o-mini",
        },
      });

      const retrieved = await client.getSession(created.id);

      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.metadata?.title).toBe("Existing");
    });

    it("lists all sessions", async () => {
      await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          title: "Session 1",
          modelId: "openai/gpt-4o-mini",
        },
      });

      await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          title: "Session 2",
          modelId: "openai/gpt-4o-mini",
        },
      });

      const sessions = await client.listSessions();
      expect(sessions).toHaveLength(2);
      const titles = sessions.map((session) => session.metadata?.title);
      expect(titles).toEqual(
        expect.arrayContaining(["Session 1", "Session 2"]),
      );
    });

    it("deletes a session", async () => {
      const created = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      });

      await client.deleteSession(created.id);
      const retrieved = await client.getSession(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Message Handling", () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          maxTurns: 5,
        },
      });

      sessionId = session.id;
    });

    it("sends a message and stores the AI response", async () => {
      const input: SendChatMessageInput = {
        chatSessionId: sessionId,
        input: createMockUserMessage("Hello, how are you?"),
      };

      const result = await client.sendMessage(input);

      expect(result.turnResult.state).toBe("active");
      expect(result.turnResult.currentTurn).toBe(1);
      expect(result.session.messages).toHaveLength(2);
      expect(result.session.messages[0].message.role).toBe("user");
      expect(result.session.messages[1].message.role).toBe("assistant");
      expect(result.session.metadata?.currentTurn).toBe(1);
    });

    it("configures a tool set on the first turn", async () => {
      const input: SendChatMessageInput = {
        chatSessionId: sessionId,
        input: createMockUserMessage("Use some tools"),
        toolNames: ["test-tool"],
      };

      const result = await client.sendMessage(input);

      expect(toolRegistry.getToolSetByNames).toHaveBeenCalledWith([
        "test-tool",
      ]);
      expect(result.session.metadata?.toolSet).toBeDefined();
    });

    it("rejects configuring tools after the first turn", async () => {
      await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("Initial message"),
      });

      await expect(
        client.sendMessage({
          chatSessionId: sessionId,
          input: createMockUserMessage("Second message"),
          toolNames: ["test-tool"],
        }),
      ).rejects.toThrow("Tool set must be configured on the first turn");
    });

    it("enforces the max turns limit", async () => {
      for (let index = 0; index < 5; index += 1) {
        await client.sendMessage({
          chatSessionId: sessionId,
          input: createMockUserMessage(`Message ${index + 1}`),
        });
      }

      const result = await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("This should hit the limit"),
      });

      expect(result.turnResult.state).toBe("terminated");
      expect(result.turnResult.currentTurn).toBe(5);
      expect(result.session.state).toBe("terminated");
    });

    it("throws when sending to a missing session", async () => {
      await expect(
        client.sendMessage({
          chatSessionId: "non-existent-id",
          input: createMockUserMessage("Hello"),
        }),
      ).rejects.toThrow("Chat session non-existent-id not found");
    });
  });

  describe("Tool Call Confirmation", () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          toolCallsAwaitingConfirmation: [createPendingToolCall()],
        },
      });

      sessionId = session.id;
    });

    it("confirms a tool call with outcome yes", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "yes",
      );

      expect(result.turnResult.state).toBe("active:generating");
      expect(result.session.messages.at(-1)?.message.role).toBe("tool");
    });

    it("confirms a tool call with outcome no", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "no",
      );

      expect(result.turnResult.state).toBe("active:generating");
      expect(result.session.metadata?.toolCallConfirmations).toEqual([]);
    });

    it("adds always-allow rules when outcome is yes_always", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "yes_always",
      );

      expect(result.session.metadata?.toolAlwaysAllowRules).toHaveLength(1);
      expect(result.session.metadata?.toolAlwaysAllowRules?.[0].toolName).toBe(
        "test-tool",
      );
    });
  });

  describe("Abort Handling", () => {
    it("allows aborting an in-flight turn", async () => {
      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      });

      const messagePromise = client.sendMessage({
        chatSessionId: session.id,
        input: createMockUserMessage("Test message"),
      });

      client.abort(session.id);

      const result = await messagePromise;
      expect(result.session.messages).toHaveLength(2);
    });
  });

  describe("Events", () => {
    let sessionId: string;
    const emittedEvents: Array<{ updateType: string }> = [];

    beforeEach(async () => {
      emittedEvents.length = 0;

      eventBus.subscribe("ChatUpdatedEvent", (event) => {
        emittedEvents.push({ updateType: event.updateType });
      });

      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      });

      sessionId = session.id;
    });

    it("emits lifecycle events during a turn", async () => {
      await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("Test message"),
      });

      expect(emittedEvents.length).toBeGreaterThan(0);
      const eventTypes = extractEventTypes(emittedEvents);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          "AI_RESPONSE_STARTED",
          "AI_RESPONSE_STREAMING",
          "AI_RESPONSE_COMPLETED",
          "MESSAGE_ADDED",
        ]),
      );
    });
  });

  describe("Existing Conversations", () => {
    it("continues a session with existing history", async () => {
      const existingMessages = [
        createMockChatMessage(createMockUserMessage("Previous question")),
        createMockChatMessage(createMockAssistantMessage("Previous answer")),
      ];

      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          currentTurn: 1,
        },
        messages: existingMessages,
      });

      const result = await client.sendMessage({
        chatSessionId: session.id,
        input: createMockUserMessage("New question"),
      });

      expect(result.session.messages).toHaveLength(4);
      expect(result.turnResult.currentTurn).toBe(2);
    });

    it("initializes metadata defaults when partial metadata is provided", async () => {
      const metadata: ChatMetadata = {
        title: "Initial Title",
        tags: ["initial"],
        modelId: "openai/gpt-4o-mini",
      };

      const session = await client.createSession({
        sessionType: "chat_engine",
        metadata,
      });

      expect(session.metadata?.title).toBe("Initial Title");
      expect(session.metadata?.tags).toEqual(["initial"]);
      expect(session.metadata?.currentTurn).toBe(0);
      expect(session.metadata?.maxTurns).toBe(20);
    });
  });
});
