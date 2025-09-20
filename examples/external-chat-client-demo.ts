// examples/external-chat-client-demo.ts
// Run with: `pnpm dlx tsx examples/external-chat-client-demo.ts`

import { Logger } from "tslog";
import type { ILogObj } from "tslog";
import { EventBus } from "../src/core/event-bus.js";
import { ChatSessionRepositoryImpl } from "../src/core/services/chat-engine/chat-session-repository.js";
import { TaskService } from "../src/core/services/task-service.js";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";
import { UserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { TaskRepository } from "../src/core/services/task-repository.js";
import { ExternalChatClient } from "../src/core/services/external-chat/external-chat-client.js";
import type { UserModelMessage } from "ai";

const logger = new Logger<ILogObj>();
const eventBus = new EventBus({
  environment: "server",
  logger,
});

async function setupServices() {
  const fs = await import("fs/promises");
  const settingsDir = "/tmp/dev-agent-temp-external";
  await fs.mkdir(settingsDir, { recursive: true });

  const userSettingsRepository = new UserSettingsRepository(
    `${settingsDir}/settings.json`,
  );
  const taskRepository = new TaskRepository();
  const fileWatcherService = new FileWatcherService(eventBus);

  const projectFolderService = new ProjectFolderService(
    eventBus,
    userSettingsRepository,
    fileWatcherService,
  );
  const taskService = new TaskService(eventBus, taskRepository);
  const chatSessionRepository = new ChatSessionRepositoryImpl();

  return {
    projectFolderService,
    taskService,
    chatSessionRepository,
  };
}

async function runExternalChatDemo() {
  logger.info("--- Starting External Chat Client Demo ---");

  const services = await setupServices();

  const client = new ExternalChatClient(
    eventBus,
    services.chatSessionRepository,
    services.taskService,
    services.projectFolderService,
  );

  // Listen to chat events to see status changes
  eventBus.subscribe("ChatUpdatedEvent", (event) => {
    logger.info("EVENT CATCHED:", {
      chatId: event.chatId,
      updateType: event.updateType,
      update: event.update,
    });
  });

  const tempDir = "/tmp/external-chat-demo";
  const fs = await import("fs/promises");
  await fs.mkdir(tempDir, { recursive: true });
  await services.projectFolderService.addProjectFolder(tempDir);

  // --- Test Case 1: 'terminal' mode ---
  logger.info("--- Testing 'terminal' mode ---");
  const terminalSession = await client.createExternalChatSession(tempDir, {
    modelId: "cli/claude",
    externalMode: "terminal",
  });

  logger.info(
    "Created 'terminal' session:",
    terminalSession.id,
    terminalSession.metadata?.external,
  );

  const userMessage: UserModelMessage = {
    role: "user",
    content: "Hello, this is a test for the external terminal.",
  };

  await client.sendMessageToExternal(
    terminalSession.absoluteFilePath,
    terminalSession.id,
    userMessage,
  );
  logger.info(
    "'terminal' session status after send:",
    terminalSession.sessionStatus,
  );

  logger.info("Aborting 'terminal' session...");
  await client.abortExternalChat(
    terminalSession.absoluteFilePath,
    terminalSession.id,
  );
  logger.info(
    "'terminal' session status after abort:",
    terminalSession.sessionStatus,
  );

  // --- Test Case 2: 'pty' mode ---
  logger.info("--- Testing 'pty' mode ---");
  const ptySession = await client.createExternalChatSession(tempDir, {
    modelId: "cli/claude",
    externalMode: "pty", // Or leave undefined to use default
  });

  logger.info(
    "Created 'pty' session:",
    ptySession.id,
    ptySession.metadata?.external,
  );

  await client.sendMessageToExternal(
    ptySession.absoluteFilePath,
    ptySession.id,
    userMessage,
  );
  logger.info("'pty' session status after send:", ptySession.sessionStatus);

  logger.info("Aborting 'pty' session...");
  await client.abortExternalChat(ptySession.absoluteFilePath, ptySession.id);
  logger.info("'pty' session status after abort:", ptySession.sessionStatus);

  logger.info("--- External Chat Client Demo Completed ---");
}

runExternalChatDemo().catch((error) => {
  logger.error("Demo failed:", error);
  process.exit(1);
});
