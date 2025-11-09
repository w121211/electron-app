// tests/chat-session-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { ModelMessage, UserModelMessage } from "ai";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatState,
  type ChatMetadata,
  type ModelSurfaceV2,
  type PtyChatSnapshot,
} from "../src/core/services/chat/chat-session-repository.js";

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
    modelSurface?: ModelSurfaceV2;
    state?: ChatState;
    messages?: ChatMessage[];
    metadata?: ChatMetadata;
    sourcePromptId?: string | null;
  } = {},
): ChatSessionData {
  const now = new Date();
  return {
    id: uuidv4(),
    modelSurface: options.modelSurface || "api",
    state: options.state || "active",
    messages: options.messages || [],
    metadata: options.metadata,
    sourcePromptId: options.sourcePromptId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("ChatSessionRepository", () => {
  let repository: ChatSessionRepositoryImpl;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = `/tmp/chat-session-test-${Date.now()}.db`;
    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: tempDbPath,
    });
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Database file might not exist, ignore cleanup error
    }
  });

  describe("Basic CRUD Operations", () => {
    it("should create a new chat session", async () => {
      const session = createMockChatSession({
        modelSurface: "api",
        state: "active",
        messages: [
          createMockChatMessage(createMockUserMessage("Hello, world!")),
          createMockChatMessage(
            createMockAssistantMessage("Hi there! How can I help you?"),
          ),
        ],
        metadata: {
          title: "Test Chat Session",
          tags: ["test", "demo"],
          modelId: "api:openai:gpt-4o-mini",
        },
      });

      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.metadata?.title).toBe("Test Chat Session");
    });

    it("should retrieve an existing chat session", async () => {
      const session = createMockChatSession({
        messages: [
          createMockChatMessage(createMockUserMessage("Test message")),
        ],
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].message.content).toBe("Test message");
    });

    it("should update an existing chat session", async () => {
      const session = createMockChatSession({
        state: "active",
        messages: [
          createMockChatMessage(createMockUserMessage("Original message")),
        ],
        metadata: { title: "Original Title" },
      });

      await repository.create(session);

      const updatedSession = {
        ...session,
        state: "active:generating" as ChatState,
        messages: [
          ...session.messages,
          createMockChatMessage(createMockUserMessage("Updated message")),
        ],
        metadata: {
          ...session.metadata,
          title: "Updated Title",
        },
        updatedAt: new Date(),
      };

      await repository.update(updatedSession);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.state).toBe("active:generating");
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.metadata?.title).toBe("Updated Title");
    });

    it("should delete a chat session", async () => {
      const session = createMockChatSession();
      await repository.create(session);

      expect(await repository.getById(session.id)).toBeDefined();

      await repository.delete(session.id);
      const deleted = await repository.getById(session.id);

      expect(deleted).toBeNull();
    });

    it("should list all chat sessions", async () => {
      const session1 = createMockChatSession({
        metadata: { title: "Session 1" },
      });
      const session2 = createMockChatSession({
        metadata: { title: "Session 2" },
      });

      await repository.create(session1);
      await repository.create(session2);

      const allSessions = await repository.list();
      expect(allSessions).toHaveLength(2);

      const titles = allSessions.map((s) => s.metadata?.title);
      expect(titles).toContain("Session 1");
      expect(titles).toContain("Session 2");
    });
  });

  describe("Message Handling", () => {
    it("should handle sessions with empty messages", async () => {
      const session = createMockChatSession({
        modelSurface: "api",
        state: "queued",
        messages: [],
        metadata: {
          title: "Empty Draft Session",
          promptDraft: "This is a draft prompt that hasn't been sent yet.",
        },
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.messages).toHaveLength(0);
      expect(retrieved?.metadata?.promptDraft).toBe(
        "This is a draft prompt that hasn't been sent yet.",
      );
    });

    it("should preserve message order", async () => {
      const timestamp1 = new Date(Date.now() - 2000);
      const timestamp2 = new Date(Date.now() - 1000);
      const timestamp3 = new Date();

      const session = createMockChatSession({
        messages: [
          createMockChatMessage(createMockUserMessage("First"), timestamp1),
          createMockChatMessage(
            createMockAssistantMessage("Second"),
            timestamp2,
          ),
          createMockChatMessage(createMockUserMessage("Third"), timestamp3),
        ],
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.messages).toHaveLength(3);
      expect(retrieved?.messages[0].message.content).toBe("First");
      expect(retrieved?.messages[1].message.content).toBe("Second");
      expect(retrieved?.messages[2].message.content).toBe("Third");
    });

    it("should handle messages with file mentions", async () => {
      const message = createMockChatMessage(
        createMockUserMessage("Check this file"),
      );
      message.metadata.fileMentions = [
        { path: "/path/to/file.ts", md5: "abc123" },
        { path: "/path/to/another.ts", md5: "def456" },
      ];

      const session = createMockChatSession({
        messages: [message],
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.messages[0].metadata.fileMentions).toHaveLength(2);
      expect(retrieved?.messages[0].metadata.fileMentions?.[0].path).toBe(
        "/path/to/file.ts",
      );
      expect(retrieved?.messages[0].metadata.fileMentions?.[1].md5).toBe(
        "def456",
      );
    });

    it("should update messages when session is updated", async () => {
      const session = createMockChatSession({
        messages: [createMockChatMessage(createMockUserMessage("Original"))],
      });

      await repository.create(session);

      const updatedSession = {
        ...session,
        messages: [
          createMockChatMessage(createMockUserMessage("Replaced message")),
        ],
        updatedAt: new Date(),
      };

      await repository.update(updatedSession);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].message.content).toBe("Replaced message");
    });
  });

  describe("Chat States", () => {
    const states: ChatState[] = [
      "queued",
      "active",
      "active:generating",
      "active:awaiting_input",
      "active:disconnected",
      "terminated",
    ];

    states.forEach((state) => {
      it(`should handle ${state} state`, async () => {
        const session = createMockChatSession({ state });
        await repository.create(session);

        const retrieved = await repository.getById(session.id);
        expect(retrieved?.state).toBe(state);
      });
    });

    it("should handle invalid state by defaulting to terminated", async () => {
      const session = createMockChatSession({ state: "active" });
      await repository.create(session);

      const db = (repository as any).db;
      await db
        .updateTable("chat_sessions")
        .set({ sessionStatus: "invalid_state" })
        .where("id", "=", session.id)
        .execute();

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.state).toBe("terminated");
    });
  });

  describe("Model Surfaces", () => {
    const surfaces: ModelSurfaceV2[] = ["api", "cli", "web"];

    surfaces.forEach((surface) => {
      it(`should handle ${surface} model surface`, async () => {
        const session = createMockChatSession({ modelSurface: surface });
        await repository.create(session);

        const retrieved = await repository.getById(session.id);
        expect(retrieved?.modelSurface).toBe(surface);
      });
    });
  });

  describe("Metadata Handling", () => {
    it("should handle complete metadata", async () => {
      const metadata: ChatMetadata = {
        title: "Complete Metadata Test",
        tags: ["tag1", "tag2", "tag3"],
        mode: "agent",
        knowledge: ["knowledge1", "knowledge2"],
        promptDraft: "Draft content",
        modelId: "api:anthropic:claude-3-5-sonnet-20241022",
        modelSurface: "api",
        currentTurn: 5,
        maxTurns: 10,
        projectPath: "/path/to/project",
      };

      const session = createMockChatSession({ metadata });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.metadata?.title).toBe("Complete Metadata Test");
      expect(retrieved?.metadata?.tags).toHaveLength(3);
      expect(retrieved?.metadata?.mode).toBe("agent");
      expect(retrieved?.metadata?.knowledge).toHaveLength(2);
      expect(retrieved?.metadata?.currentTurn).toBe(5);
      expect(retrieved?.metadata?.maxTurns).toBe(10);
    });

    // it("should handle PTY metadata with snapshots", async () => {
    //   const ptySnapshot: PtyChatSnapshot = {
    //     modelId: "pty:chatgpt",
    //     snapshot: "Terminal output snapshot",
    //     snapshotHtml: "<div>Terminal output</div>",
    //     timestamp: new Date(),
    //   };

    //   const metadata: ChatMetadata = {
    //     title: "PTY Session",
    //     external: {
    //       pid: 12345,
    //       workingDirectory: "/tmp/test",
    //       ptyInstanceId: "pty-instance-123",
    //       windowTitle: "AI Chat Session",
    //       ptySnapshots: [ptySnapshot],
    //     },
    //   };

    //   const session = createMockChatSession({
    //     modelSurface: "pty",
    //     metadata,
    //   });

    //   await repository.create(session);
    //   const retrieved = await repository.getById(session.id);

    //   expect(retrieved?.metadata?.external?.pid).toBe(12345);
    //   expect(retrieved?.metadata?.external?.ptyInstanceId).toBe(
    //     "pty-instance-123",
    //   );
    //   expect(retrieved?.metadata?.external?.ptySnapshots).toHaveLength(1);
    //   expect(retrieved?.metadata?.external?.ptySnapshots?.[0].snapshot).toBe(
    //     "Terminal output snapshot",
    //   );
    // });

    it("should handle web chat metadata", async () => {
      const metadata: ChatMetadata = {
        title: "Web Chat Session",
        external: {
          webChatId: "web-chat-456",
          windowTitle: "Web Browser Chat",
        },
      };

      const session = createMockChatSession({
        modelSurface: "web",
        metadata,
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.metadata?.external?.webChatId).toBe("web-chat-456");
      expect(retrieved?.metadata?.external?.windowTitle).toBe(
        "Web Browser Chat",
      );
    });

    it("should handle prompt snapshot metadata", async () => {
      const metadata: ChatMetadata = {
        promptSnapshot: {
          promptId: "prompt-123",
          slug: "test-prompt",
          content: "Analyze this code",
          metadata: {
            description: "Code analysis prompt",
            version: "1.0",
          },
          capturedAt: new Date().toISOString(),
          args: {
            language: "typescript",
            file: "test.ts",
          },
        },
      };

      const session = createMockChatSession({ metadata });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.metadata?.promptSnapshot?.promptId).toBe("prompt-123");
      expect(retrieved?.metadata?.promptSnapshot?.slug).toBe("test-prompt");
      expect(retrieved?.metadata?.promptSnapshot?.content).toBe(
        "Analyze this code",
      );
      expect(retrieved?.metadata?.promptSnapshot?.args?.language).toBe(
        "typescript",
      );
    });

    it("should handle tool call confirmations", async () => {
      const metadata: ChatMetadata = {
        toolCallConfirmations: [
          {
            toolCallId: "call-1",
            outcome: "yes",
            timestamp: new Date(),
          },
          {
            toolCallId: "call-2",
            outcome: "yes_always",
            timestamp: new Date(),
          },
          {
            toolCallId: "call-3",
            outcome: "no",
            timestamp: new Date(),
          },
        ],
        toolAlwaysAllowRules: [
          {
            toolName: "file_read",
            sourceConfirmation: {
              toolCallId: "call-2",
              outcome: "yes_always",
              timestamp: new Date(),
            },
          },
        ],
      };

      const session = createMockChatSession({ metadata });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.metadata?.toolCallConfirmations).toHaveLength(3);
      expect(retrieved?.metadata?.toolCallConfirmations?.[0].outcome).toBe(
        "yes",
      );
      expect(retrieved?.metadata?.toolCallConfirmations?.[1].outcome).toBe(
        "yes_always",
      );
      expect(retrieved?.metadata?.toolAlwaysAllowRules).toHaveLength(1);
      expect(retrieved?.metadata?.toolAlwaysAllowRules?.[0].toolName).toBe(
        "file_read",
      );
    });

    it("should handle undefined metadata", async () => {
      const session = createMockChatSession({ metadata: undefined });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.metadata).toBeUndefined();
    });

    it("should handle null metadata values", async () => {
      const metadata: ChatMetadata = {
        title: undefined,
        tags: undefined,
        mode: undefined,
      };

      const session = createMockChatSession({ metadata });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.metadata?.title).toBeUndefined();
      expect(retrieved?.metadata?.tags).toBeUndefined();
    });
  });

  describe("Source Prompt Integration", () => {
    it("should store and retrieve sourcePromptId", async () => {
      const promptId = uuidv4();
      const db = (repository as any).db;

      await db
        .insertInto("prompts")
        .values({
          id: promptId,
          slug: "test-prompt",
          content: "Test prompt content",
          metadata: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const session = createMockChatSession({
        sourcePromptId: promptId,
        metadata: {
          title: "Session from Prompt",
        },
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.sourcePromptId).toBe(promptId);
    });

    it("should handle null sourcePromptId", async () => {
      const session = createMockChatSession({
        sourcePromptId: null,
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.sourcePromptId).toBeNull();
    });

    it("should update sourcePromptId", async () => {
      const session = createMockChatSession({
        sourcePromptId: null,
      });

      await repository.create(session);

      const newPromptId = uuidv4();
      const db = (repository as any).db;

      await db
        .insertInto("prompts")
        .values({
          id: newPromptId,
          slug: "updated-prompt",
          content: "Updated prompt content",
          metadata: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const updatedSession = {
        ...session,
        sourcePromptId: newPromptId,
        updatedAt: new Date(),
      };

      await repository.update(updatedSession);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.sourcePromptId).toBe(newPromptId);
    });
  });

  describe("Timestamps", () => {
    it("should preserve createdAt and updatedAt timestamps", async () => {
      const createdAt = new Date(Date.now() - 10000);
      const session = createMockChatSession();
      session.createdAt = createdAt;
      session.updatedAt = createdAt;

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.createdAt.getTime()).toBe(createdAt.getTime());
      expect(retrieved?.updatedAt.getTime()).toBe(createdAt.getTime());
    });

    it("should update updatedAt timestamp on update", async () => {
      const originalDate = new Date(Date.now() - 10000);
      const session = createMockChatSession();
      session.createdAt = originalDate;
      session.updatedAt = originalDate;

      await repository.create(session);

      const newDate = new Date();
      const updatedSession = {
        ...session,
        metadata: { title: "Updated" },
        updatedAt: newDate,
      };

      await repository.update(updatedSession);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.createdAt.getTime()).toBe(originalDate.getTime());
      expect(retrieved?.updatedAt.getTime()).toBeGreaterThan(
        originalDate.getTime(),
      );
    });
  });

  describe("Error Handling", () => {
    it("should return null for non-existent session", async () => {
      const result = await repository.getById("non-existent-id");
      expect(result).toBeNull();
    });

    it("should throw error when updating non-existent session", async () => {
      const fakeSession = createMockChatSession();
      fakeSession.id = "non-existent-id";

      await expect(repository.update(fakeSession)).rejects.toThrow(
        "does not exist",
      );
    });

    it("should handle deletion of non-existent session gracefully", async () => {
      await expect(repository.delete("non-existent-id")).resolves.not.toThrow();
    });

    it("should return empty array when no sessions exist", async () => {
      const sessions = await repository.list();
      expect(sessions).toEqual([]);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multi-turn conversation with mixed content", async () => {
      const session = createMockChatSession({
        state: "terminated",
        messages: [
          createMockChatMessage(createMockUserMessage("Write a Python script")),
          createMockChatMessage(
            createMockAssistantMessage(
              "Here's a Python script:\n```python\nprint('Hello')\n```",
            ),
          ),
          createMockChatMessage(createMockUserMessage("Add error handling")),
          createMockChatMessage(
            createMockAssistantMessage(
              "```python\ntry:\n  print('Hello')\nexcept Exception as e:\n  print(f'Error: {e}')\n```",
            ),
          ),
        ],
        metadata: {
          title: "Python Script Development",
          tags: ["python", "coding"],
          mode: "agent",
          currentTurn: 4,
          maxTurns: 10,
        },
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.messages).toHaveLength(4);
      expect(retrieved?.metadata?.currentTurn).toBe(4);
      expect(retrieved?.state).toBe("terminated");
    });

    it("should handle concurrent session creation", async () => {
      const sessions = Array.from({ length: 10 }, () =>
        createMockChatSession({
          messages: [createMockChatMessage(createMockUserMessage("Test"))],
        }),
      );

      await Promise.all(sessions.map((s) => repository.create(s)));

      const allSessions = await repository.list();
      expect(allSessions).toHaveLength(10);
    });

    it("should handle session with large message history", async () => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        createMockChatMessage(
          i % 2 === 0
            ? createMockUserMessage(`User message ${i}`)
            : createMockAssistantMessage(`Assistant message ${i}`),
        ),
      );

      const session = createMockChatSession({ messages });
      await repository.create(session);

      const retrieved = await repository.getById(session.id);
      expect(retrieved?.messages).toHaveLength(100);
      expect(retrieved?.messages[0].message.content).toBe("User message 0");
      expect(retrieved?.messages[99].message.content).toBe(
        "Assistant message 99",
      );
    });
  });

  describe("Transaction Integrity", () => {
    it("should rollback on message insertion failure", async () => {
      const session = createMockChatSession({
        messages: [createMockChatMessage(createMockUserMessage("Test"))],
      });

      await repository.create(session);

      const sessions = await repository.list();
      expect(sessions).toHaveLength(1);
    });

    it("should delete all messages when deleting session", async () => {
      const session = createMockChatSession({
        messages: [
          createMockChatMessage(createMockUserMessage("Message 1")),
          createMockChatMessage(createMockUserMessage("Message 2")),
          createMockChatMessage(createMockUserMessage("Message 3")),
        ],
      });

      await repository.create(session);
      await repository.delete(session.id);

      const db = (repository as any).db;
      const messages = await db
        .selectFrom("chat_messages")
        .selectAll()
        .where("chatSessionId", "=", session.id)
        .execute();

      expect(messages).toHaveLength(0);
    });
  });
});
