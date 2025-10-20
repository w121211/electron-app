// tests/pty-chat-service-renderer.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChatSessionData } from "../src/core/services/chat/chat-session-repository.js";

// Mock the stores
vi.mock("../src/renderer/src/stores/chat.svelte.js", () => ({
  setChatSession: vi.fn(),
}));

// Mock the trpc client
const mockTrpcClient = {
  ptyChat: {
    getSession: {
      query: vi.fn(),
    },
    terminateSession: {
      mutate: vi.fn(),
    },
    updateSession: {
      mutate: vi.fn(),
    },
  },
};

vi.mock("../src/renderer/src/lib/trpc-client.js", () => ({
  trpcClient: mockTrpcClient,
}));

// Mock other stores
vi.mock("../src/renderer/src/stores/documents.svelte.js", () => ({
  documents: {},
}));

vi.mock("../src/renderer/src/stores/editor-views.svelte.js", () => ({
  editorViews: {},
}));

vi.mock("../src/renderer/src/stores/ui.svelte.js", () => ({
  getSelectedDocContext: vi.fn(),
}));

// Mock pty stream manager
const mockPtyStreamManager = {
  getStream: vi.fn(),
};

vi.mock("../src/renderer/src/services/pty-stream-manager.js", () => ({
  ptyStreamManager: mockPtyStreamManager,
}));

// Import after mocks are set up
const { PtyChatService } = await import(
  "../src/renderer/src/services/pty-chat-service.js"
);

describe("PtyChatService - terminateSessionWithSnapshot", () => {
  let service: InstanceType<typeof PtyChatService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PtyChatService();
  });

  it("should throw error for non-PTY chat session", async () => {
    // Arrange: Create a non-PTY chat session
    const apiChatSession: ChatSessionData = {
      id: "test-session-123",
      sessionType: "api_chat", // Not a PTY chat!
      state: "active",
      messages: [],
      metadata: {},
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTrpcClient.ptyChat.getSession.query.mockResolvedValue(apiChatSession);

    // Act & Assert: Should throw error
    await expect(
      service.terminateSessionWithSnapshot("test-session-123"),
    ).rejects.toThrow("Session is not a PTY chat session");

    // Verify we checked the session type
    expect(mockTrpcClient.ptyChat.getSession.query).toHaveBeenCalledWith({
      chatSessionId: "test-session-123",
    });

    // Verify we never tried to terminate
    expect(mockTrpcClient.ptyChat.terminateSession.mutate).not.toHaveBeenCalled();
  });

  it("should terminate PTY chat session with snapshot", async () => {
    // Arrange: Create a PTY chat session with snapshot
    const ptyChatSession: ChatSessionData = {
      id: "pty-session-456",
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata: {
        modelId: "anthropic/claude-3-5-sonnet-20241022",
        external: {
          ptyInstanceId: "pty-instance-789",
          ptySnapshots: [],
        },
      },
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPtyStream = {
      getTerminalSnapshot: vi.fn().mockReturnValue("Terminal output here\x1b[0m"),
    };

    mockTrpcClient.ptyChat.getSession.query.mockResolvedValue(ptyChatSession);
    mockPtyStreamManager.getStream.mockReturnValue(mockPtyStream);
    mockTrpcClient.ptyChat.updateSession.mutate.mockResolvedValue({
      ...ptyChatSession,
      metadata: {
        ...ptyChatSession.metadata,
        external: {
          ...ptyChatSession.metadata?.external,
          ptySnapshots: [
            {
              modelId: "anthropic/claude-3-5-sonnet-20241022",
              snapshot: "Terminal output here",
              timestamp: expect.any(Date),
            },
          ],
        },
      },
    });
    mockTrpcClient.ptyChat.terminateSession.mutate.mockResolvedValue({
      ...ptyChatSession,
      state: "terminated",
    });

    // Act: Terminate with snapshot
    await service.terminateSessionWithSnapshot("pty-session-456");

    // Assert: Verify snapshot was captured and saved
    expect(mockPtyStreamManager.getStream).toHaveBeenCalledWith(
      "pty-instance-789",
    );
    expect(mockPtyStream.getTerminalSnapshot).toHaveBeenCalled();

    // Verify snapshot was saved
    expect(mockTrpcClient.ptyChat.updateSession.mutate).toHaveBeenCalledWith({
      chatSessionId: "pty-session-456",
      updates: {
        metadata: expect.objectContaining({
          external: expect.objectContaining({
            pty: expect.objectContaining({
              snapshots: expect.arrayContaining([
                expect.objectContaining({
                  modelId: "anthropic/claude-3-5-sonnet-20241022",
                  snapshot: "Terminal output here",
                }),
              ]),
            }),
          }),
        }),
      },
    });

    // Verify session was terminated
    expect(mockTrpcClient.ptyChat.terminateSession.mutate).toHaveBeenCalledWith(
      {
        chatSessionId: "pty-session-456",
      },
    );
  });

  it("should terminate PTY session without snapshot if no PTY instance", async () => {
    // Arrange: PTY session without active PTY instance
    const ptyChatSession: ChatSessionData = {
      id: "pty-session-no-instance",
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata: {
        modelId: "anthropic/claude-3-5-sonnet-20241022",
        external: {},
      },
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTrpcClient.ptyChat.getSession.query.mockResolvedValue(ptyChatSession);
    mockTrpcClient.ptyChat.terminateSession.mutate.mockResolvedValue({
      ...ptyChatSession,
      state: "terminated",
    });

    // Act: Terminate (should skip snapshot)
    await service.terminateSessionWithSnapshot("pty-session-no-instance");

    // Assert: Should NOT try to get snapshot
    expect(mockPtyStreamManager.getStream).not.toHaveBeenCalled();

    // But should still terminate
    expect(mockTrpcClient.ptyChat.terminateSession.mutate).toHaveBeenCalledWith(
      {
        chatSessionId: "pty-session-no-instance",
      },
    );
  });

  it("should throw error if PTY session has no model ID", async () => {
    // Arrange: PTY session without model ID
    const ptyChatSession: ChatSessionData = {
      id: "pty-session-no-model",
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata: {
        external: {
          ptyInstanceId: "pty-instance-123",
        },
      },
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTrpcClient.ptyChat.getSession.query.mockResolvedValue(ptyChatSession);

    // Act & Assert: Should throw error
    await expect(
      service.terminateSessionWithSnapshot("pty-session-no-model"),
    ).rejects.toThrow("No model ID found for session");
  });

  it("should handle snapshot capture failure gracefully", async () => {
    // Arrange: PTY session where snapshot capture fails
    const ptyChatSession: ChatSessionData = {
      id: "pty-session-snapshot-fail",
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata: {
        modelId: "anthropic/claude-3-5-sonnet-20241022",
        external: {
          ptyInstanceId: "pty-instance-fail",
        },
      },
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPtyStream = {
      getTerminalSnapshot: vi.fn().mockImplementation(() => {
        throw new Error("Snapshot capture failed");
      }),
    };

    mockTrpcClient.ptyChat.getSession.query.mockResolvedValue(ptyChatSession);
    mockPtyStreamManager.getStream.mockReturnValue(mockPtyStream);
    mockTrpcClient.ptyChat.terminateSession.mutate.mockResolvedValue({
      ...ptyChatSession,
      state: "terminated",
    });

    // Act: Should not throw, but should terminate anyway
    await service.terminateSessionWithSnapshot("pty-session-snapshot-fail");

    // Assert: Should NOT save snapshot
    expect(mockTrpcClient.ptyChat.updateSession.mutate).not.toHaveBeenCalled();

    // But should still terminate
    expect(mockTrpcClient.ptyChat.terminateSession.mutate).toHaveBeenCalledWith(
      {
        chatSessionId: "pty-session-snapshot-fail",
      },
    );
  });
});
