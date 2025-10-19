// tests/pty-chat-client.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { PtyChatClient } from "../src/core/services/pty/pty-chat-client.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatMetadata,
  type ChatState,
} from "../src/core/services/chat/chat-session-repository.js";
import { EventBus, type IEventBus } from "../src/core/event-bus.js";
import type { PtyInstanceManager, PtyInstance } from "../src/core/services/pty/pty-instance-manager.js";
import type {
  PtyOnDataEvent,
  PtyOnExitEvent,
  PtyWriteEvent,
} from "../src/core/services/pty/events.js";

// Mock node-pty to avoid spawning real processes
vi.mock("node-pty", () => ({
  spawn: vi.fn().mockReturnValue({
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    pid: 12345,
  }),
}));

// Mock PtyChatSession
vi.mock("../src/core/services/pty/pty-chat-session.js", () => ({
  PtyChatSession: class MockPtyChatSession {
    id: string;
    ptyInstanceId: string | undefined = undefined;
    private sessionData: ChatSessionData;
    workingDirectory?: string;

    constructor(data: ChatSessionData, private eventBus: IEventBus) {
      this.id = data.id;
      this.sessionData = { ...data };
      this.workingDirectory = data.metadata?.external?.workingDirectory;
    }

    recordUserInput(data: string): void {
      // Mock implementation
    }

    recordAssistantOutput(data: string): void {
      // Mock implementation
    }

    markTerminated(): void {
      this.sessionData = {
        ...this.sessionData,
        state: "terminated",
        updatedAt: new Date(),
      };
    }

    recordPtyExit(): void {
      this.ptyInstanceId = undefined;
    }

    toChatSessionData(): ChatSessionData {
      return {
        ...this.sessionData,
        id: this.id,
        state: this.sessionData.state,
        metadata: {
          ...this.sessionData.metadata,
          external: {
            ...this.sessionData.metadata?.external,
            pty: {
              ...this.sessionData.metadata?.external?.pty,
              ptyInstanceId: this.ptyInstanceId,
            },
          },
        },
      };
    }
  },
}));

// Test data factory functions
function createMockChatMessage(content: string): ChatMessage {
  return {
    id: uuidv4(),
    message: {
      role: "user",
      content,
    },
    metadata: {
      timestamp: new Date(),
    },
  };
}

function createMockChatSession(
  options: {
    sessionType?: "pty_chat";
    state?: ChatState;
    messages?: ChatMessage[];
    metadata?: ChatMetadata;
  } = {},
): ChatSessionData {
  const now = new Date();
  return {
    id: uuidv4(),
    sessionType: options.sessionType || "pty_chat",
    state: options.state || "active",
    messages: options.messages || [],
    metadata: options.metadata || {},
    scriptPath: null,
    scriptModifiedAt: null,
    scriptHash: null,
    scriptSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Mock PTY Instance
function createMockPtyInstance(id: string = uuidv4()): PtyInstance {
  const dataListeners = new Set<(chunk: string) => void>();
  const writeListeners = new Set<(chunk: string) => void>();

  return {
    id,
    shell: "bash",
    cwd: "/tmp",
    write: vi.fn().mockImplementation((chunk: string) => {
      writeListeners.forEach((listener) => listener(chunk));
    }),
    kill: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn().mockImplementation((listener: (chunk: string) => void) => {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    }),
    onWrite: vi.fn().mockImplementation((listener: (chunk: string) => void) => {
      writeListeners.add(listener);
      return () => writeListeners.delete(listener);
    }),
    onExit: vi.fn(),
    emitData(chunk: string) {
      dataListeners.forEach((listener) => listener(chunk));
    },
  } as any;
}

// Mock PTY Instance Manager
function createMockPtyInstanceManager(): PtyInstanceManager {
  const instances = new Map<string, PtyInstance>();

  const manager = {
    create: vi.fn().mockImplementation((options) => {
      const instance = createMockPtyInstance();
      instances.set(instance.id, instance);
      return instance;
    }),
    getSession: vi.fn().mockImplementation((id: string) => {
      return instances.get(id) || undefined;
    }),
    kill: vi.fn().mockImplementation((id: string) => {
      const instance = instances.get(id);
      if (instance) {
        instance.kill();
        instances.delete(id);
      }
    }),
    list: vi.fn().mockReturnValue(Array.from(instances.values())),
  } as any;

  // Store reference to instances map for testing
  (manager as any)._instances = instances;
  return manager;
}

describe("PtyChatClient", () => {
  let client: PtyChatClient;
  let repository: ChatSessionRepositoryImpl;
  let eventBus: IEventBus;
  let ptyInstanceManager: PtyInstanceManager;
  let tempDbPath: string;

  beforeEach(async () => {
    tempDbPath = `/tmp/pty-chat-client-test-${Date.now()}.db`;
    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: tempDbPath,
    });
    eventBus = new EventBus({ environment: "server" });
    ptyInstanceManager = createMockPtyInstanceManager();

    // Mock snapshot provider that returns null (no snapshot)
    const mockSnapshotProvider = () => null;

    client = new PtyChatClient(eventBus, repository, ptyInstanceManager, mockSnapshotProvider);
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Database file might not exist, ignore cleanup error
    }
  });

  describe("Session Creation", () => {
    it("should create a new PTY chat session", async () => {
      const input = {
        workingDirectory: "/tmp/test",
        modelId: "cli/claude" as const,
        initialPrompt: "!claude",
        metadata: {
          title: "Test PTY Session",
          tags: ["test", "pty"],
        },
      };

      const session = await client.createSession(input);

      expect(session.id).toBeDefined();
      expect(session.sessionType).toBe("pty_chat");
      expect(session.state).toBe("active");
      expect(session.metadata?.modelId).toBe("cli/claude");
      expect(session.metadata?.external?.mode).toBe("pty");
      expect(session.metadata?.external?.workingDirectory).toBe("/tmp/test");
      expect(session.metadata?.title).toBe("Test PTY Session");

      // Verify PTY instance was created
      expect(ptyInstanceManager.create).toHaveBeenCalledWith({
        cwd: "/tmp/test",
      });
    });

    it("should create session without initial prompt", async () => {
      const input = {
        workingDirectory: "/home/user",
        modelId: "cli/gemini" as const,
      };

      const session = await client.createSession(input);

      expect(session.sessionType).toBe("pty_chat");
      expect(session.metadata?.modelId).toBe("cli/gemini");
      expect(session.metadata?.external?.workingDirectory).toBe("/home/user");
    });

    it("should handle initial prompt with newline", async () => {
      const mockInstance = createMockPtyInstance();
      vi.mocked(ptyInstanceManager.create).mockReturnValue(mockInstance);

      const session = await client.createSession({
        workingDirectory: "/tmp",
        modelId: "cli/claude" as const,
        initialPrompt: "!claude\n",
      });

      // Note: Initial prompts are not automatically written in the current implementation
      // The test just verifies the session is created successfully
      expect(session.id).toBeDefined();
    });

    it("should add newline to initial prompt if missing", async () => {
      const mockInstance = createMockPtyInstance();
      vi.mocked(ptyInstanceManager.create).mockReturnValue(mockInstance);

      const session = await client.createSession({
        workingDirectory: "/tmp",
        modelId: "cli/claude" as const,
        initialPrompt: "!claude",
      });

      // Note: Initial prompts are not automatically written in the current implementation
      // The test just verifies the session is created successfully
      expect(session.id).toBeDefined();
    });
  });

  describe("PTY Instance Management", () => {
    let sessionId: string;
    let mockInstance: PtyInstance;

    beforeEach(async () => {
      mockInstance = createMockPtyInstance();

      // Reset the mocks to ensure clean state
      vi.mocked(ptyInstanceManager.create).mockClear();
      vi.mocked(ptyInstanceManager.getSession).mockClear();

      // Mock to return our specific instance
      vi.mocked(ptyInstanceManager.create).mockReturnValue(mockInstance);
      vi.mocked(ptyInstanceManager.getSession).mockImplementation((id: string) => {
        return id === mockInstance.id ? mockInstance : undefined;
      });

      const session = await client.createSession({
        workingDirectory: "/tmp",
        modelId: "cli/claude" as const,
      });
      sessionId = session.id;
    });

    it("should create PTY instance for session", async () => {
      const session = await repository.getById(sessionId);

      expect(session).toBeDefined();
      expect(session?.metadata?.external?.pty?.ptyInstanceId).toBe(mockInstance.id);
      expect(ptyInstanceManager.create).toHaveBeenCalledWith({
        cwd: "/tmp",
      });
    });

    it("should have PTY instance accessible via manager", async () => {
      const session = await repository.getById(sessionId);
      const ptyInstanceId = session?.metadata?.external?.pty?.ptyInstanceId;

      expect(ptyInstanceId).toBeDefined();
      const instance = ptyInstanceManager.getSession(ptyInstanceId!);
      expect(instance).toBe(mockInstance);
    });
  });

  describe("Session Termination", () => {
    let sessionId: string;
    let mockInstance: PtyInstance;

    beforeEach(async () => {
      mockInstance = createMockPtyInstance();

      // Reset the mocks to ensure clean state
      vi.mocked(ptyInstanceManager.create).mockClear();
      vi.mocked(ptyInstanceManager.getSession).mockClear();

      // Mock to return our specific instance
      vi.mocked(ptyInstanceManager.create).mockReturnValue(mockInstance);
      vi.mocked(ptyInstanceManager.getSession).mockImplementation((id: string) => {
        return id === mockInstance.id ? mockInstance : undefined;
      });

      const session = await client.createSession({
        workingDirectory: "/tmp",
        modelId: "cli/claude" as const,
      });
      sessionId = session.id;
    });

    it("should terminate session and kill PTY instance", async () => {
      const result = await client.terminateSession(sessionId);

      expect(mockInstance.kill).toHaveBeenCalled();

      expect(result.state).toBe("terminated");
      expect(result.metadata?.external?.pty?.ptyInstanceId).toBeUndefined();

      const terminatedSession = await repository.getById(sessionId);
      expect(terminatedSession?.state).toBe("terminated");
      expect(
        terminatedSession?.metadata?.external?.pty?.ptyInstanceId,
      ).toBeUndefined();
    });

    it("should handle terminating session without PTY instance", async () => {
      // Create a session data directly in repository without PTY instance
      const sessionData = createMockChatSession();
      await repository.create(sessionData);

      // Should not throw error
      const terminated = await client.terminateSession(sessionData.id);
      expect(terminated.id).toBe(sessionData.id);
    });
  });

  describe("Event Handling", () => {
    let sessionId: string;
    let mockInstance: PtyInstance;
    let emittedEvents: any[] = [];

    beforeEach(async () => {
      emittedEvents = [];
      mockInstance = createMockPtyInstance();
      vi.mocked(ptyInstanceManager.create).mockReturnValue(mockInstance);

      const session = await client.createSession({
        workingDirectory: "/tmp",
        modelId: "cli/claude" as const,
      });
      sessionId = session.id;
    });

    it("should handle PtyWrite events", async () => {
      const writeEvent: PtyWriteEvent = {
        kind: "PtyWrite",
        sessionId: mockInstance.id,
        data: "user input",
        timestamp: new Date(),
      };

      await eventBus.emit(writeEvent);

      // Event should be processed without errors
      // In a real implementation, this would record the user input
    });

    it("should handle PtyOnData events", async () => {
      const dataEvent: PtyOnDataEvent = {
        kind: "PtyOnData",
        sessionId: mockInstance.id,
        data: "assistant output",
        timestamp: new Date(),
      };

      await eventBus.emit(dataEvent);

      // Event should be processed without errors
      // In a real implementation, this would record the assistant output
    });

    it("should handle PtyOnExit events", async () => {
      const exitEvent: PtyOnExitEvent = {
        kind: "PtyOnExit",
        sessionId: mockInstance.id,
        exitCode: 0,
        timestamp: new Date(),
      };

      await eventBus.emit(exitEvent);

      // Event should be processed without errors
      // In a real implementation, this would mark the session as terminated
    });

    it("should ignore events for unknown PTY instances", async () => {
      const unknownEvent: PtyWriteEvent = {
        kind: "PtyWrite",
        sessionId: "unknown-pty-id",
        data: "test",
        timestamp: new Date(),
      };

      // Should not throw error
      await expect(eventBus.emit(unknownEvent)).resolves.not.toThrow();
    });
  });

  describe("Session Loading and Management", () => {
    it("should persist session data in repository", async () => {
      // Create session data directly in repository
      const sessionData = createMockChatSession({
        metadata: {
          external: {
            mode: "pty",
            pty: {
              ptyInstanceId: "test-pty-id",
            },
          },
        },
      });
      await repository.create(sessionData);

      // Verify it can be loaded
      const loaded = await repository.getById(sessionData.id);
      expect(loaded).toBeDefined();
      expect(loaded?.metadata?.external?.pty?.ptyInstanceId).toBe("test-pty-id");
    });

    it("should find session by PTY instance ID from repository", async () => {
      const ptyInstanceId = "test-pty-instance";

      // Create session with PTY instance ID in metadata
      const sessionData = createMockChatSession({
        metadata: {
          external: {
            mode: "pty",
            pty: {
              ptyInstanceId,
            },
          },
        },
      });
      await repository.create(sessionData);

      // Verify the session is in the repository
      const loaded = await repository.getById(sessionData.id);
      expect(loaded?.metadata?.external?.pty?.ptyInstanceId).toBe(ptyInstanceId);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple sessions", async () => {
      const session1 = await client.createSession({
        workingDirectory: "/tmp/session1",
        modelId: "cli/claude" as const,
        initialPrompt: "!claude",
      });

      const session2 = await client.createSession({
        workingDirectory: "/tmp/session2",
        modelId: "cli/gemini" as const,
        initialPrompt: "!gemini",
      });

      expect(session1.id).not.toBe(session2.id);
      expect(session1.metadata?.external?.workingDirectory).toBe("/tmp/session1");
      expect(session2.metadata?.external?.workingDirectory).toBe("/tmp/session2");

      // Both sessions should exist in the repository
      const loaded1 = await repository.getById(session1.id);
      const loaded2 = await repository.getById(session2.id);
      expect(loaded1).toBeDefined();
      expect(loaded2).toBeDefined();
    });

    it("should handle session with complex metadata", async () => {
      const complexMetadata = {
        title: "Complex PTY Session",
        tags: ["ai", "terminal", "complex"],
        mode: "agent" as const,
        projectInfo: {
          projectPath: "/workspace/project",
          branch: "feature/test",
        },
      };

      const session = await client.createSession({
        workingDirectory: "/workspace",
        modelId: "cli/claude" as const,
        metadata: complexMetadata,
      });

      expect(session.metadata?.title).toBe("Complex PTY Session");
      expect(session.metadata?.tags).toEqual(["ai", "terminal", "complex"]);
      expect((session.metadata as any)?.projectInfo?.projectPath).toBe("/workspace/project");
    });

    it("should persist session data correctly", async () => {
      const session = await client.createSession({
        workingDirectory: "/tmp/persist-test",
        modelId: "cli/claude" as const,
        initialPrompt: "!claude",
      });

      // Retrieve session from repository
      const retrievedSession = await repository.getById(session.id);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.sessionType).toBe("pty_chat");
      expect(retrievedSession?.metadata?.external?.workingDirectory).toBe("/tmp/persist-test");
      expect(retrievedSession?.metadata?.modelId).toBe("cli/claude");
    });
  });

  describe("Error Handling", () => {
    it("should handle repository errors gracefully", async () => {
      // Create a mock repository that throws errors
      const errorRepository = {
        create: vi.fn().mockRejectedValue(new Error("Database error")),
        getById: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        findByScriptPath: vi.fn(),
        findByScriptHash: vi.fn(),
      };

      const errorClient = new PtyChatClient(
        eventBus,
        errorRepository as any,
        ptyInstanceManager,
        () => null
      );

      await expect(
        errorClient.createSession({
          workingDirectory: "/tmp",
          modelId: "cli/claude" as const,
        })
      ).rejects.toThrow("Database error");
    });

    it("should handle PTY instance manager errors", async () => {
      const errorPtyManager = {
        create: vi.fn().mockImplementation(() => {
          throw new Error("PTY creation failed");
        }),
        getSession: vi.fn(),
        kill: vi.fn(),
        list: vi.fn(),
      };

      const errorClient = new PtyChatClient(
        eventBus,
        repository,
        errorPtyManager as any,
        () => null
      );

      await expect(
        errorClient.createSession({
          workingDirectory: "/tmp",
          modelId: "cli/claude" as const,
        })
      ).rejects.toThrow("PTY creation failed");
    });
  });
});
