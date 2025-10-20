// examples/chat-session-repository-demo.ts
// Run with: `pnpm dlx tsx examples/chat-session-repository-demo.ts`

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "tslog";
import type { ILogObj } from "tslog";
import type { ModelMessage, UserModelMessage } from "ai";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatSessionType,
  type ChatSessionStatus,
  type ChatMetadata,
} from "../src/core/services/chat/chat-session-repository.js";

const logger = new Logger<ILogObj>();

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

// Helper function to create a content hash for a script
function createScriptHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function testBasicCrudOperations(repository: ChatSessionRepositoryImpl) {
  logger.info("=== Testing Basic CRUD Operations ===");

  // Test CREATE
  logger.info("Testing CREATE operation...");
  const session1 = createMockChatSession({
    sessionType: "chat_engine",
    sessionStatus: "idle",
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

  await repository.create(session1);
  logger.info(`✓ Created session: ${session1.id}`);

  // Test READ
  logger.info("Testing READ operation...");
  const retrievedSession = await repository.getById(session1.id);
  if (!retrievedSession) {
    throw new Error("Failed to retrieve created session");
  }
  logger.info(`✓ Retrieved session: ${retrievedSession.id} with ${retrievedSession.messages.length} messages`);

  // Test UPDATE
  logger.info("Testing UPDATE operation...");
  const updatedSession = {
    ...retrievedSession,
    sessionStatus: "processing" as ChatSessionStatus,
    messages: [
      ...retrievedSession.messages,
      createMockChatMessage(createMockUserMessage("What's the weather like?")),
    ],
    metadata: {
      ...retrievedSession.metadata,
      title: "Updated Test Chat Session",
    },
    updatedAt: new Date(),
  };

  await repository.update(updatedSession);
  const reRetrievedSession = await repository.getById(session1.id);
  if (!reRetrievedSession || reRetrievedSession.sessionStatus !== "processing") {
    throw new Error("Failed to update session");
  }
  logger.info(`✓ Updated session: ${reRetrievedSession.id}, status: ${reRetrievedSession.sessionStatus}`);

  // Test LIST
  logger.info("Testing LIST operation...");
  const allSessions = await repository.list();
  logger.info(`✓ Found ${allSessions.length} sessions in database`);

  // Test DELETE
  logger.info("Testing DELETE operation...");
  await repository.delete(session1.id);
  const deletedCheck = await repository.getById(session1.id);
  if (deletedCheck !== null) {
    throw new Error("Failed to delete session");
  }
  logger.info(`✓ Deleted session: ${session1.id}`);

  logger.info("✓ All basic CRUD operations completed successfully");
}

async function testPromptScriptIntegration(repository: ChatSessionRepositoryImpl) {
  logger.info("=== Testing Prompt Script Integration ===");

  // Create temporary script files for testing
  const tempDir = "/tmp/chat-session-repo-demo";
  await fs.mkdir(tempDir, { recursive: true });

  const scriptPath1 = path.join(tempDir, "test-script.prompt.md");
  const scriptContent1 = `---
title: "Test Script"
engine: api
model: openai/gpt-4o-mini
---

Write a hello world program in Python.
<!-- user -->

Now add error handling to it.`;

  const scriptPath2 = path.join(tempDir, "another-script.prompt.md");
  const scriptContent2 = `---
title: "Another Script"
engine: pty
---

!claude
<!-- user -->

What time is it?`;

  await fs.writeFile(scriptPath1, scriptContent1);
  await fs.writeFile(scriptPath2, scriptContent2);

  const scriptHash1 = createScriptHash(scriptContent1);
  const scriptHash2 = createScriptHash(scriptContent2);

  logger.info("Created test script files");
  logger.info(`Script 1: ${scriptPath1} (hash: ${scriptHash1.substring(0, 8)}...)`);
  logger.info(`Script 2: ${scriptPath2} (hash: ${scriptHash2.substring(0, 8)}...)`);

  // Test creating sessions with script metadata
  logger.info("Testing session creation with script metadata...");

  const session1 = createMockChatSession({
    sessionType: "chat_engine",
    sessionStatus: "idle",
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

  const session2 = createMockChatSession({
    sessionType: "pty_chat",
    sessionStatus: "external_active",
    messages: [
      createMockChatMessage(createMockUserMessage("!claude")),
      createMockChatMessage(createMockUserMessage("What time is it?")),
    ],
    metadata: {
      title: "Another Script",
      external: {
        ptyInstanceId: "pty-123",
        windowTitle: "AI Chat pty-123",
      },
    },
    scriptPath: scriptPath2,
    scriptModifiedAt: new Date(),
    scriptHash: scriptHash2,
    scriptSnapshot: scriptContent2,
  });

  await repository.create(session1);
  await repository.create(session2);

  logger.info(`✓ Created session with script metadata: ${session1.id}`);
  logger.info(`✓ Created PTY session with script metadata: ${session2.id}`);

  // Test findByScriptPath
  logger.info("Testing findByScriptPath...");
  const foundByPath1 = await repository.findByScriptPath(scriptPath1);
  const foundByPath2 = await repository.findByScriptPath(scriptPath2);

  if (!foundByPath1 || foundByPath1.id !== session1.id) {
    throw new Error("Failed to find session by script path 1");
  }
  if (!foundByPath2 || foundByPath2.id !== session2.id) {
    throw new Error("Failed to find session by script path 2");
  }

  logger.info(`✓ Found session by path: ${foundByPath1.id} -> ${foundByPath1.scriptPath}`);
  logger.info(`✓ Found session by path: ${foundByPath2.id} -> ${foundByPath2.scriptPath}`);

  // Test findByScriptHash
  logger.info("Testing findByScriptHash...");
  const foundByHash1 = await repository.findByScriptHash(scriptHash1);
  const foundByHash2 = await repository.findByScriptHash(scriptHash2);

  if (foundByHash1.length !== 1 || foundByHash1[0].id !== session1.id) {
    throw new Error("Failed to find session by script hash 1");
  }
  if (foundByHash2.length !== 1 || foundByHash2[0].id !== session2.id) {
    throw new Error("Failed to find session by script hash 2");
  }

  logger.info(`✓ Found ${foundByHash1.length} session(s) by hash: ${scriptHash1.substring(0, 8)}...`);
  logger.info(`✓ Found ${foundByHash2.length} session(s) by hash: ${scriptHash2.substring(0, 8)}...`);

  // Test script content changes (simulating file edits)
  logger.info("Testing script content change detection...");

  const modifiedScriptContent = scriptContent1 + "\n<!-- user -->\n\nNow make it more robust.";
  const modifiedScriptHash = createScriptHash(modifiedScriptContent);

  await fs.writeFile(scriptPath1, modifiedScriptContent);

  // Update session with new hash
  const updatedSession = {
    ...session1,
    scriptHash: modifiedScriptHash,
    scriptSnapshot: modifiedScriptContent,
    scriptModifiedAt: new Date(),
    updatedAt: new Date(),
  };

  await repository.update(updatedSession);

  // Verify old hash no longer finds the session
  const oldHashResults = await repository.findByScriptHash(scriptHash1);
  const newHashResults = await repository.findByScriptHash(modifiedScriptHash);

  if (oldHashResults.length !== 0) {
    throw new Error("Old hash should not find any sessions after update");
  }
  if (newHashResults.length !== 1 || newHashResults[0].id !== session1.id) {
    throw new Error("New hash should find the updated session");
  }

  logger.info(`✓ Script hash updated: ${scriptHash1.substring(0, 8)}... -> ${modifiedScriptHash.substring(0, 8)}...`);

  // Cleanup
  await repository.delete(session1.id);
  await repository.delete(session2.id);
  await fs.rm(tempDir, { recursive: true });

  logger.info("✓ Prompt script integration tests completed successfully");
}

async function testComplexScenarios(repository: ChatSessionRepositoryImpl) {
  logger.info("=== Testing Complex Scenarios ===");

  // Test multiple sessions with same script hash (representing multiple runs of same script)
  logger.info("Testing multiple sessions with same script hash...");

  const sharedScriptContent = "Calculate 2 + 2";
  const sharedScriptHash = createScriptHash(sharedScriptContent);

  const session1 = createMockChatSession({
    sessionType: "chat_engine",
    messages: [
      createMockChatMessage(createMockUserMessage("Calculate 2 + 2")),
      createMockChatMessage(createMockAssistantMessage("2 + 2 = 4")),
    ],
    metadata: { modelId: "openai/gpt-4o-mini" },
    scriptHash: sharedScriptHash,
    scriptSnapshot: sharedScriptContent,
  });

  const session2 = createMockChatSession({
    sessionType: "chat_engine",
    messages: [
      createMockChatMessage(createMockUserMessage("Calculate 2 + 2")),
      createMockChatMessage(createMockAssistantMessage("The answer is 4.")),
    ],
    metadata: { modelId: "anthropic/claude-3-sonnet" },
    scriptHash: sharedScriptHash,
    scriptSnapshot: sharedScriptContent,
  });

  await repository.create(session1);
  await repository.create(session2);

  const hashResults = await repository.findByScriptHash(sharedScriptHash);
  if (hashResults.length !== 2) {
    throw new Error(`Expected 2 sessions with same hash, found ${hashResults.length}`);
  }

  logger.info(`✓ Found ${hashResults.length} sessions with shared script hash`);

  // Test session with complex metadata
  logger.info("Testing session with complex metadata...");

  const complexSession = createMockChatSession({
    sessionType: "pty_chat",
    sessionStatus: "external_terminated",
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
        pid: 12345,
        workingDirectory: "/tmp/test",
        ptyInstanceId: "pty-complex-123",
        windowTitle: "AI Chat pty-complex-123",
        ptySnapshots: [
          {
            modelId: "cli/claude",
            snapshot: "Last command output...",
            snapshotHtml: "<div>Last command output...</div>",
            timestamp: new Date(),
          },
        ],
      },
      currentTurn: 4,
      maxTurns: 10,
    },
  });

  await repository.create(complexSession);
  const retrievedComplex = await repository.getById(complexSession.id);

  if (
    !retrievedComplex ||
    !retrievedComplex.metadata?.external?.ptySnapshots?.[0]?.snapshot
  ) {
    throw new Error("Failed to store/retrieve complex metadata");
  }

  logger.info(`✓ Created and retrieved session with complex metadata: ${retrievedComplex.id}`);

  // Test session with empty messages
  logger.info("Testing session with empty messages...");

  const emptySession = createMockChatSession({
    sessionType: "chat_draft",
    sessionStatus: "scheduled",
    messages: [],
    metadata: {
      title: "Empty Draft Session",
      promptDraft: "This is a draft prompt that hasn't been sent yet.",
    },
  });

  await repository.create(emptySession);
  const retrievedEmpty = await repository.getById(emptySession.id);

  if (!retrievedEmpty || retrievedEmpty.messages.length !== 0) {
    throw new Error("Failed to handle session with empty messages");
  }

  logger.info(`✓ Created and retrieved session with empty messages: ${retrievedEmpty.id}`);

  // Cleanup
  await repository.delete(session1.id);
  await repository.delete(session2.id);
  await repository.delete(complexSession.id);
  await repository.delete(emptySession.id);

  logger.info("✓ Complex scenario tests completed successfully");
}

async function testErrorHandling(repository: ChatSessionRepositoryImpl) {
  logger.info("=== Testing Error Handling ===");

  // Test retrieving non-existent session
  logger.info("Testing retrieval of non-existent session...");
  const nonExistent = await repository.getById("non-existent-id");
  if (nonExistent !== null) {
    throw new Error("Expected null for non-existent session");
  }
  logger.info("✓ Correctly returned null for non-existent session");

  // Test updating non-existent session
  logger.info("Testing update of non-existent session...");
  const fakeSession = createMockChatSession();
  fakeSession.id = "non-existent-id";

  try {
    await repository.update(fakeSession);
    throw new Error("Expected error when updating non-existent session");
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      logger.info("✓ Correctly threw error for non-existent session update");
    } else {
      throw error;
    }
  }

  // Test findByScriptHash with empty/null hash
  logger.info("Testing findByScriptHash with empty hash...");
  const emptyResults = await repository.findByScriptHash("");
  if (emptyResults.length !== 0) {
    throw new Error("Expected empty results for empty hash");
  }
  logger.info("✓ Correctly returned empty results for empty hash");

  // Test findByScriptPath with non-existent path
  logger.info("Testing findByScriptPath with non-existent path...");
  const pathResult = await repository.findByScriptPath("/non/existent/path.prompt.md");
  if (pathResult !== null) {
    throw new Error("Expected null for non-existent script path");
  }
  logger.info("✓ Correctly returned null for non-existent script path");

  logger.info("✓ Error handling tests completed successfully");
}

async function main() {
  logger.info("Starting Chat Session Repository Demo");

  // Setup temporary database
  const tempDbPath = "/tmp/chat-session-repo-demo.db";
  const repository = new ChatSessionRepositoryImpl({
    databaseFilePath: tempDbPath,
  });

  try {
    // Run all test suites
    await testBasicCrudOperations(repository);
    await testPromptScriptIntegration(repository);
    await testComplexScenarios(repository);
    await testErrorHandling(repository);

    logger.info("=== ALL TESTS COMPLETED SUCCESSFULLY ===");
    logger.info("✓ Basic CRUD operations");
    logger.info("✓ Prompt script integration (path/hash lookup)");
    logger.info("✓ Complex scenarios (multiple models, PTY sessions)");
    logger.info("✓ Error handling and edge cases");

  } catch (error) {
    logger.error("Demo failed:", error);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await fs.unlink(tempDbPath);
      logger.info("✓ Cleaned up temporary database");
    } catch {
      // Database file might not exist, ignore cleanup error
    }
  }
}

// Run the demo
main().catch((error) => {
  logger.error("Demo failed with error:", error);
  process.exit(1);
});
