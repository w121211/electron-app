// examples/pty-chat-client-demo.ts
// Run with: `npx tsx examples/pty-chat-client-demo.ts`

import { Logger } from "tslog";
import type { ILogObj } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { EventBus } from "../src/core/event-bus.js";
import { ChatSessionRepositoryImpl } from "../src/core/services/chat/chat-session-repository.js";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";
import { UserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { createPtyInstanceManager } from "../src/core/services/pty/pty-instance-manager.js";
import { PtyChatClient } from "../src/core/services/pty/pty-chat-client.js";
import type { ChatSessionData } from "../src/core/services/chat/chat-session-repository.js";
import {
  PtyOnDataEvent,
  PtyOnExitEvent,
  PtyWriteEvent,
} from "../src/core/services/pty/events.js";

const logger = new Logger<ILogObj>();
const eventBus = new EventBus({
  environment: "server",
  logger,
});

async function setupServices() {
  const fs = await import("fs/promises");
  const settingsDir = "/tmp/dev-agent-temp-pty";
  await fs.mkdir(settingsDir, { recursive: true });

  const userSettingsRepository = new UserSettingsRepository(
    `${settingsDir}/settings.json`,
  );
  const fileWatcherService = new FileWatcherService(eventBus);

  const projectFolderService = new ProjectFolderService(
    eventBus,
    userSettingsRepository,
    fileWatcherService,
  );
  const chatSessionRepository = new ChatSessionRepositoryImpl();

  // Create ptyInstanceManager with the event bus
  const ptyInstanceManager = createPtyInstanceManager(eventBus);

  return {
    projectFolderService,
    chatSessionRepository,
    ptyInstanceManager,
  };
}

async function runPtyChatDemo() {
  logger.info("--- Starting PTY Chat Client Demo ---");

  const services = await setupServices();

  const client = new PtyChatClient(
    eventBus,
    services.chatSessionRepository,
    services.projectFolderService,
    services.ptyInstanceManager,
  );

  // Listen to PTY events to see the new event-driven architecture in action
  eventBus.subscribe("PtyWrite", (event: PtyWriteEvent) => {
    logger.info("EVENT CATCHED: PtyWrite", event);
  });
  eventBus.subscribe("PtyOnData", (event: PtyOnDataEvent) => {
    logger.info("EVENT CATCHED: PtyOnData", { data: event.data.trim() });
  });
  eventBus.subscribe("PtyOnExit", (event: PtyOnExitEvent) => {
    logger.info("EVENT CATCHED: PtyOnExit", event);
  });

  const tempDir = "/tmp/pty-chat-demo";
  const fs = await import("fs/promises");
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  await services.projectFolderService.addProjectFolder(tempDir);

  // --- Test Case 1: Create a new PTY session from scratch ---
  logger.info("--- Testing creating a new PTY session ---");
  const session1 = await client.createPtyChat(tempDir, {
    modelId: "cli/codex",
    initialPrompt: 'echo "Hello from PTY session 1!"',
  });
  logger.info("Created new PTY session:", session1.id, session1.ptyInstanceId);

  // --- Test Case 2: Start a PTY session from a draft chat ---
  await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for first session to settle
  logger.info("--- Testing starting a PTY session from a draft ---");

  const draftData: ChatSessionData = {
    _type: "chat",
    id: uuidv4(),
    absoluteFilePath: "",
    messages: [],
    modelId: "openai/gpt-4o",
    sessionStatus: "idle",
    fileStatus: "active",
    currentTurn: 0,
    maxTurns: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      mode: "chat",
      title: "My Draft Chat",
      promptDraft: 'echo "Hello from a draft session!"',
    },
  };

  const draftPath = await services.chatSessionRepository.createNewFile(
    tempDir,
    draftData,
  );
  draftData.absoluteFilePath = draftPath;

  logger.info(`Created draft chat file: ${draftPath}`);

  const session2 = await client.createFromDraft(
    draftPath,
    draftData.metadata!.promptDraft!,
    "cli/codex",
  );
  logger.info(
    "Started PTY session from draft:",
    session2.id,
    session2.ptyInstanceId,
  );

  // --- Test Case 3: Terminate sessions ---
  await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for events
  logger.info("--- Testing session termination ---");

  const ptyInstance1 = services.ptyInstanceManager.getSession(
    session1.ptyInstanceId!,
  );
  if (ptyInstance1) {
    logger.info(`Killing session 1 (${ptyInstance1.id})`);
    ptyInstance1.kill();
  }

  const ptyInstance2 = services.ptyInstanceManager.getSession(
    session2.ptyInstanceId!,
  );
  if (ptyInstance2) {
    logger.info(`Killing session 2 (${ptyInstance2.id})`);
    ptyInstance2.kill();
  }

  await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for exit events
  logger.info("--- PTY Chat Client Demo Completed ---");
}

runPtyChatDemo().catch((error) => {
  logger.error("Demo failed:", error);
  process.exit(1);
});
