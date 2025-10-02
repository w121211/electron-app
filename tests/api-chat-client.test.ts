// tests/api-chat-client.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { ModelMessage, UserModelMessage, ToolSet } from "ai";
import {
  ApiChatClient,
  type CreateChatSessionInput,
  type SendChatMessageInput,
} from "../src/core/services/chat-engine/api-chat-client.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatSessionType,
  type ChatSessionStatus,
  type ChatMetadata,
} from "../src/core/services/chat/chat-session-repository.js";
import { EventBus, type IEventBus } from "../src/core/event-bus.js";
import type { ToolRegistry } from "../src/core/services/tool-call/tool-registry.js";
import type { ToolExecutionResult } from "../src/core/services/tool-call/tool-call-runner.js";

// Mock ToolCallRunner
vi.mock("../src/core/services/tool-call/tool-call-runner.js", () => ({
  ToolCallRunner: class MockToolCallRunner {
    constructor() {}

    async execute(): Promise<ToolExecutionResult<ToolSet>> {
      return {
        status: "completed",
        executed: [
          {
            type: "tool-result",
            toolCallId: "test-tool-call-1",
            toolName: "test-tool",
            result: "Mock tool execution result",
          },
        ],
      };
    }
  },
}));

// Mock AI SDK
vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn().mockReturnValue({
    name: "mock-model",
    provider: "mock",
  }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual("ai");
  return {
    ...actual,
    streamText: vi.fn().mockImplementation(() => {
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
              content: "Hello world!",
            },
          ],
        }),
      };
    }),
  };
});

// Test data factory functions
function createMockUserMessage(content: string): UserModelMessage {
  return {
    role: "user",
    content,
  };
}

function createMockAssistantMessage(content: string): ModelMessage {
  return {
    role: "assistant",
    content,
  };
}

function createMockChatMessage(
  message: ModelMessage,
  timestamp: Date = new Date(),
): ChatMessage {
  return {
    id: uuidv4(),
    message,
    metadata: {
      timestamp,
    },
  };
}

function createMockChatSession(
  options: {
    sessionType?: ChatSessionType;
    sessionStatus?: ChatSessionStatus;
    messages?: ChatMessage[];
    metadata?: ChatMetadata;
    scriptPath?: string;
    scriptModifiedAt?: Date;
    scriptHash?: string;
    scriptSnapshot?: string;
  } = {},
): ChatSessionData {
  const now = new Date();
  return {
    id: uuidv4(),
    sessionType: options.sessionType || "chat_engine",
    sessionStatus: options.sessionStatus || "idle",
    messages: options.messages || [],
    metadata: options.metadata,
    scriptPath: options.scriptPath || null,
    scriptModifiedAt: options.scriptModifiedAt || null,
    scriptHash: options.scriptHash || null,
    scriptSnapshot: options.scriptSnapshot || null,
    createdAt: now,
    updatedAt: now,
  };
}

// Mock tool registry
function createMockToolRegistry(): ToolRegistry {
  const mockTool = {
    description: "Mock tool",
    parameters: {},
    execute: vi.fn().mockResolvedValue({ result: "mock result" }),
  };

  return {
    getToolSetByNames: vi.fn().mockReturnValue({}),
    getTool: vi.fn().mockReturnValue(mockTool),
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
    getToolMetadata: vi.fn().mockReturnValue([]),
    generateHealthReport: vi.fn().mockResolvedValue({
      totalTools: 0,
      healthyTools: 0,
      unhealthyTools: 0,
      mcpServers: { total: 0, healthy: 0, unhealthy: 0 },
      details: new Map(),
    }),
    connectMCPServer: vi.fn(),
    disconnectMCPServer: vi.fn(),
    listMCPServers: vi.fn().mockReturnValue([]),
  } as any;
}

describe("ApiChatClient", () => {
  let client: ApiChatClient;
  let repository: ChatSessionRepositoryImpl;
  let eventBus: IEventBus;
  let toolRegistry: ToolRegistry;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = `/tmp/api-chat-client-test-${Date.now()}.db`;
    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: tempDbPath,
    });
    eventBus = new EventBus({ environment: "server" });
    toolRegistry = createMockToolRegistry();

    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Database file might not exist, ignore cleanup error
    }
  });

  describe("Session Management", () => {
    it("should create a new chat session", async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          title: "Test Session",
          modelId: "openai/gpt-4o-mini",
          maxTurns: 10,
        },
        status: "idle",
      };

      const session = await client.createSession(input);

      expect(session.id).toBeDefined();
      expect(session.sessionType).toBe("chat_engine");
      expect(session.sessionStatus).toBe("idle");
      expect(session.metadata?.title).toBe("Test Session");
      expect(session.metadata?.modelId).toBe("openai/gpt-4o-mini");
      expect(session.metadata?.maxTurns).toBe(10);
      expect(session.metadata?.currentTurn).toBe(0);
    });

    it("should create a session with script metadata", async () => {
      const scriptContent = "Write a hello world program";
      const scriptHash = crypto.createHash("sha256").update(scriptContent).digest("hex");
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
      expect(session.scriptModifiedAt).toEqual(modifiedAt);
      expect(session.scriptHash).toBe(scriptHash);
      expect(session.scriptSnapshot).toBe(scriptContent);
    });

    it("should get an existing session", async () => {
      const mockSession = createMockChatSession({
        metadata: {
          title: "Test Session",
          modelId: "openai/gpt-4o-mini",
        },
      });

      await repository.create(mockSession);
      const retrieved = await client.getSession(mockSession.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(mockSession.id);
      expect(retrieved?.metadata?.title).toBe("Test Session");
    });

    it("should return null for non-existent session", async () => {
      const result = await client.getSession("non-existent-id");
      expect(result).toBeNull();
    });

    it("should list all sessions", async () => {
      const session1 = createMockChatSession({ metadata: { title: "Session 1" } });
      const session2 = createMockChatSession({ metadata: { title: "Session 2" } });

      await repository.create(session1);
      await repository.create(session2);

      const sessions = await client.listSessions();
      expect(sessions).toHaveLength(2);

      const titles = sessions.map(s => s.metadata?.title);
      expect(titles).toContain("Session 1");
      expect(titles).toContain("Session 2");
    });

    it("should delete a session", async () => {
      const session = createMockChatSession();
      await repository.create(session);

      expect(await client.getSession(session.id)).toBeDefined();

      await client.deleteSession(session.id);
      const deleted = await client.getSession(session.id);

      expect(deleted).toBeNull();
    });
  });

  describe("Message Handling", () => {
    let sessionId: string;

    beforeEach(async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          maxTurns: 5,
        },
      };

      const session = await client.createSession(input);
      sessionId = session.id;
    });

    it("should send a message and receive response", async () => {
      const input: SendChatMessageInput = {
        chatSessionId: sessionId,
        input: createMockUserMessage("Hello, how are you?"),
      };

      const result = await client.sendMessage(input);

      expect(result.turnResult.sessionStatus).toBe("idle");
      expect(result.turnResult.currentTurn).toBe(1);
      expect(result.session.messages).toHaveLength(2); // User message + assistant response
      expect(result.session.messages[0].message.role).toBe("user");
      expect(result.session.messages[0].message.content).toBe("Hello, how are you?");
      expect(result.session.messages[1].message.role).toBe("assistant");
      expect(result.session.messages[1].message.content).toBe("Hello world!");
    });

    it("should handle tool configuration on first turn", async () => {
      const input: SendChatMessageInput = {
        chatSessionId: sessionId,
        input: createMockUserMessage("Use some tools"),
        toolNames: ["test-tool"],
      };

      const result = await client.sendMessage(input);

      expect(result.session.metadata?.toolSet).toBeDefined();
      expect(toolRegistry.getToolSetByNames).toHaveBeenCalledWith(["test-tool"]);
    });

    it("should prevent adding tools after first turn", async () => {
      // First turn without tools
      await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("First message"),
      });

      // Second turn trying to add tools should fail
      const input: SendChatMessageInput = {
        chatSessionId: sessionId,
        input: createMockUserMessage("Second message"),
        toolNames: ["test-tool"],
      };

      await expect(client.sendMessage(input)).rejects.toThrow(
        "Tool set must be configured on the first turn"
      );
    });

    it("should handle max turns limit", async () => {
      // Send messages up to the limit
      for (let i = 0; i < 5; i++) {
        await client.sendMessage({
          chatSessionId: sessionId,
          input: createMockUserMessage(`Message ${i + 1}`),
        });
      }

      // Next message should hit the limit
      const result = await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("This should hit the limit"),
      });

      expect(result.turnResult.sessionStatus).toBe("max_turns_reached");
    });

    it("should throw error for non-existent session", async () => {
      const input: SendChatMessageInput = {
        chatSessionId: "non-existent-id",
        input: createMockUserMessage("Hello"),
      };

      await expect(client.sendMessage(input)).rejects.toThrow(
        "Chat session non-existent-id not found"
      );
    });
  });

  describe("Tool Call Confirmation", () => {
    let sessionId: string;

    beforeEach(async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          toolCallsAwaitingConfirmation: [
            {
              toolCallId: "test-tool-call-1",
              toolName: "test-tool",
              args: { param: "value" },
            },
          ],
        },
        status: "waiting_confirmation",
      };

      const session = await client.createSession(input);
      sessionId = session.id;
    });

    it("should confirm tool call with yes", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "yes"
      );

      // After tool execution, the session continues processing with the AI response
      expect(["idle", "processing"]).toContain(result.session.sessionStatus);
    });

    it("should confirm tool call with no", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "no"
      );

      // After tool execution, the session continues processing with the AI response
      expect(["idle", "processing"]).toContain(result.session.sessionStatus);
    });

    it("should handle yes_always confirmation", async () => {
      const result = await client.confirmToolCall(
        sessionId,
        "test-tool-call-1",
        "yes_always"
      );

      // Check that the rule was added to metadata
      expect(result.session.metadata?.toolAlwaysAllowRules).toBeDefined();
      expect(result.session.metadata?.toolAlwaysAllowRules).toHaveLength(1);
      expect(result.session.metadata?.toolAlwaysAllowRules?.[0].toolName).toBe("test-tool");
    });
  });

  describe("Session Status Management", () => {
    let sessionId: string;

    beforeEach(async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      };

      const session = await client.createSession(input);
      sessionId = session.id;
    });

    it("should handle session abortion", async () => {
      // Start a message (this would normally stream)
      const messagePromise = client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("Test message"),
      });

      // Abort immediately
      client.abort(sessionId);

      // The message should still complete (in our mock), but abort should not throw
      const result = await messagePromise;
      expect(result).toBeDefined();
    });
  });

  describe("Event Emission", () => {
    let sessionId: string;
    let emittedEvents: any[] = [];

    beforeEach(async () => {
      emittedEvents = [];

      // Subscribe to all events
      eventBus.subscribe("ChatUpdatedEvent", (event) => {
        emittedEvents.push(event);
      });

      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      };

      const session = await client.createSession(input);
      sessionId = session.id;
    });

    it("should emit events during message processing", async () => {
      await client.sendMessage({
        chatSessionId: sessionId,
        input: createMockUserMessage("Test message"),
      });

      // Should emit multiple events during processing
      expect(emittedEvents.length).toBeGreaterThan(0);

      const eventTypes = emittedEvents.map(e => e.updateType);
      expect(eventTypes).toContain("MESSAGE_ADDED");
      expect(eventTypes).toContain("AI_RESPONSE_STARTED");
      expect(eventTypes).toContain("AI_RESPONSE_COMPLETED");
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle session with existing messages", async () => {
      const existingMessages = [
        createMockChatMessage(createMockUserMessage("Previous question")),
        createMockChatMessage(createMockAssistantMessage("Previous answer")),
      ];

      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          currentTurn: 1,
        },
        messages: existingMessages,
      };

      const session = await client.createSession(input);

      expect(session.messages).toHaveLength(2);
      expect(session.metadata?.currentTurn).toBe(1);

      // Send another message
      const result = await client.sendMessage({
        chatSessionId: session.id,
        input: createMockUserMessage("New question"),
      });

      expect(result.session.messages).toHaveLength(4); // 2 existing + 2 new
      expect(result.turnResult.currentTurn).toBe(2);
    });

    it("should handle metadata updates correctly", async () => {
      const input: CreateChatSessionInput = {
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
          title: "Initial Title",
          tags: ["initial"],
        },
      };

      const session = await client.createSession(input);

      // The session should maintain metadata structure
      expect(session.metadata?.title).toBe("Initial Title");
      expect(session.metadata?.tags).toEqual(["initial"]);
      expect(session.metadata?.currentTurn).toBe(0);
      expect(session.metadata?.maxTurns).toBe(20); // DEFAULT_MAX_TURNS
    });
  });
});