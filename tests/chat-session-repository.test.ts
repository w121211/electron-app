// tests/chat-session-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { ModelMessage, UserModelMessage } from "ai";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatSessionType,
  type ChatState,
  type ChatMetadata,
} from "../src/core/services/chat/chat-session-repository.js";

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
    state?: ChatState;
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
    state: options.state || "active",
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

// Helper function to create a content hash for a script
function createScriptHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
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
        sessionType: "chat_engine",
        state: "active",
        messages: [
          createMockChatMessage(createMockUserMessage("Hello, world!")),
          createMockChatMessage(createMockAssistantMessage("Hi there! How can I help you?")),
        ],
        metadata: {
          title: "Test Chat Session",
          tags: ["test", "demo"],
          modelId: "openai/gpt-4o-mini",
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
        messages: [createMockChatMessage(createMockUserMessage("Original message"))],
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

    it("should list all chat sessions", async () => {
      const session1 = createMockChatSession({ metadata: { title: "Session 1" } });
      const session2 = createMockChatSession({ metadata: { title: "Session 2" } });

      await repository.create(session1);
      await repository.create(session2);

      const allSessions = await repository.list();
      expect(allSessions).toHaveLength(2);

      const titles = allSessions.map(s => s.metadata?.title);
      expect(titles).toContain("Session 1");
      expect(titles).toContain("Session 2");
    });

    it("should delete a chat session", async () => {
      const session = createMockChatSession();
      await repository.create(session);

      expect(await repository.getById(session.id)).toBeDefined();

      await repository.delete(session.id);
      const deleted = await repository.getById(session.id);

      expect(deleted).toBeNull();
    });
  });

  describe("Prompt Script Integration", () => {
    let tempDir: string;
    let scriptPath1: string;
    let scriptPath2: string;
    let scriptContent1: string;
    let scriptContent2: string;
    let scriptHash1: string;
    let scriptHash2: string;

    beforeEach(async () => {
      tempDir = `/tmp/chat-session-test-scripts-${Date.now()}`;
      await fs.mkdir(tempDir, { recursive: true });

      scriptPath1 = path.join(tempDir, "test-script.prompt.md");
      scriptContent1 = `---
title: "Test Script"
engine: api
model: openai/gpt-4o-mini
---

Write a hello world program in Python.
<!-- user -->

Now add error handling to it.`;

      scriptPath2 = path.join(tempDir, "another-script.prompt.md");
      scriptContent2 = `---
title: "Another Script"
engine: pty
---

!claude
<!-- user -->

What time is it?`;

      await fs.writeFile(scriptPath1, scriptContent1);
      await fs.writeFile(scriptPath2, scriptContent2);

      scriptHash1 = createScriptHash(scriptContent1);
      scriptHash2 = createScriptHash(scriptContent2);
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Directory might not exist, ignore cleanup error
      }
    });

    it("should create sessions with script metadata", async () => {
      const session = createMockChatSession({
        sessionType: "chat_engine",
        messages: [
          createMockChatMessage(createMockUserMessage("Write a hello world program in Python.")),
          createMockChatMessage(createMockAssistantMessage("```python\nprint('Hello, World!')\n```")),
        ],
        metadata: {
          title: "Test Script",
          modelId: "openai/gpt-4o-mini",
        },
        scriptPath: scriptPath1,
        scriptModifiedAt: new Date(),
        scriptHash: scriptHash1,
        scriptSnapshot: scriptContent1,
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.scriptPath).toBe(path.resolve(scriptPath1));
      expect(retrieved?.scriptHash).toBe(scriptHash1);
      expect(retrieved?.scriptSnapshot).toBe(scriptContent1);
    });

    it("should find sessions by script path", async () => {
      const session = createMockChatSession({
        scriptPath: scriptPath1,
        scriptHash: scriptHash1,
        scriptSnapshot: scriptContent1,
      });

      await repository.create(session);
      const found = await repository.findByScriptPath(scriptPath1);

      expect(found).toBeDefined();
      expect(found?.id).toBe(session.id);
      expect(found?.scriptPath).toBe(path.resolve(scriptPath1));
    });

    it("should find sessions by script hash", async () => {
      const session = createMockChatSession({
        scriptPath: scriptPath1,
        scriptHash: scriptHash1,
        scriptSnapshot: scriptContent1,
      });

      await repository.create(session);
      const found = await repository.findByScriptHash(scriptHash1);

      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(session.id);
      expect(found[0].scriptHash).toBe(scriptHash1);
    });

    it("should handle multiple sessions with same script hash", async () => {
      const sharedContent = "Calculate 2 + 2";
      const sharedHash = createScriptHash(sharedContent);

      const session1 = createMockChatSession({
        metadata: { modelId: "openai/gpt-4o-mini" },
        scriptHash: sharedHash,
        scriptSnapshot: sharedContent,
      });

      const session2 = createMockChatSession({
        metadata: { modelId: "anthropic/claude-3-sonnet" },
        scriptHash: sharedHash,
        scriptSnapshot: sharedContent,
      });

      await repository.create(session1);
      await repository.create(session2);

      const found = await repository.findByScriptHash(sharedHash);
      expect(found).toHaveLength(2);

      const ids = found.map(s => s.id);
      expect(ids).toContain(session1.id);
      expect(ids).toContain(session2.id);
    });

    it("should handle script content changes", async () => {
      const session = createMockChatSession({
        scriptPath: scriptPath1,
        scriptHash: scriptHash1,
        scriptSnapshot: scriptContent1,
      });

      await repository.create(session);

      // Simulate script modification
      const modifiedContent = scriptContent1 + "\n<!-- user -->\n\nNow make it more robust.";
      const modifiedHash = createScriptHash(modifiedContent);

      const updatedSession = {
        ...session,
        scriptHash: modifiedHash,
        scriptSnapshot: modifiedContent,
        scriptModifiedAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.update(updatedSession);

      // Old hash should not find the session
      const oldResults = await repository.findByScriptHash(scriptHash1);
      expect(oldResults).toHaveLength(0);

      // New hash should find the session
      const newResults = await repository.findByScriptHash(modifiedHash);
      expect(newResults).toHaveLength(1);
      expect(newResults[0].id).toBe(session.id);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle PTY sessions with complex metadata", async () => {
      const session = createMockChatSession({
        sessionType: "pty_chat",
        state: "terminated",
        messages: [
          createMockChatMessage(createMockUserMessage("!claude")),
          createMockChatMessage(createMockUserMessage("Write a Python script")),
          createMockChatMessage(createMockUserMessage("/new")),
          createMockChatMessage(createMockUserMessage("!gemini")),
        ],
        metadata: {
          title: "Multi-Model PTY Session",
          tags: ["pty", "multi-model", "complex"],
          mode: "agent",
          external: {
            mode: "pty",
            pid: 12345,
            workingDirectory: "/tmp/test",
            pty: {
              initialCommand: "!claude",
              ptyInstanceId: "pty-complex-123",
              snapshots: [
                {
                  modelId: "anthropic/claude-3-5-sonnet-20241022",
                  snapshot: "Last command output...",
                  snapshotHtml: "<div>Last command output...</div>",
                  timestamp: new Date(),
                },
              ],
            },
          },
          currentTurn: 4,
          maxTurns: 10,
        },
      });

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.sessionType).toBe("pty_chat");
      expect(retrieved?.metadata?.external?.pty?.snapshots?.[0].snapshot).toBe("Last command output...");
      expect(retrieved?.metadata?.currentTurn).toBe(4);
      expect(retrieved?.messages).toHaveLength(4);
    });

    it("should handle sessions with empty messages", async () => {
      const session = createMockChatSession({
        sessionType: "chat_draft",
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
      expect(retrieved?.metadata?.promptDraft).toBe("This is a draft prompt that hasn't been sent yet.");
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

      await expect(repository.update(fakeSession)).rejects.toThrow("does not exist");
    });

    it("should return empty array for empty script hash", async () => {
      const results = await repository.findByScriptHash("");
      expect(results).toHaveLength(0);
    });

    it("should return null for non-existent script path", async () => {
      const result = await repository.findByScriptPath("/non/existent/path.prompt.md");
      expect(result).toBeNull();
    });
  });
});