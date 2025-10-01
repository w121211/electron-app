// examples/create-chat-from-template-demo.ts
// Run with: `pnpm tsx examples/create-chat-from-template-demo.ts`

import path from "path";
import { fileURLToPath } from "node:url";
import { Logger } from "tslog";
import type { ILogObj } from "tslog";
import { EventBus } from "../src/core/event-bus.js";
import { ApiChatClient as ChatEngineClient } from "../src/core/services/chat-engine/api-chat-client.js";
import { ChatSessionRepositoryImpl } from "../src/core/services/chat-engine/chat-session-repository.js";
import { ToolRegistryImpl } from "../src/core/services/tool-call/tool-registry.js";
import { TaskService } from "../src/core/services/task-service.js";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";
import { UserSettingsService } from "../src/core/services/user-settings-service.js";
import { UserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { TaskRepository } from "../src/core/services/task-repository.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger<ILogObj>({ name: "CreateChatFromTemplateDemo" });
const eventBus = new EventBus({
  environment: "server",
  logger,
});

async function setupServices() {
  const tempDir = "/tmp/create-chat-template-demo";
  await fs.mkdir(tempDir, { recursive: true });

  const userSettingsRepository = new UserSettingsRepository(
    path.join(tempDir, "user-settings.json"),
  );
  const taskRepository = new TaskRepository();
  const fileWatcherService = new FileWatcherService(eventBus);

  const projectFolderService = new ProjectFolderService(
    eventBus,
    userSettingsRepository,
    fileWatcherService,
  );
  await projectFolderService.addProjectFolder(tempDir);

  const userSettingsService = new UserSettingsService(userSettingsRepository);
  const taskService = new TaskService(eventBus, taskRepository);
  const chatSessionRepository = new ChatSessionRepositoryImpl();
  const toolRegistry = new ToolRegistryImpl(eventBus, logger);

  const chatClient = new ChatEngineClient(
    eventBus,
    chatSessionRepository,
    taskService,
    projectFolderService,
    userSettingsService,
    toolRegistry,
  );

  return { chatClient, projectDir: tempDir };
}

async function runDemo() {
  logger.info("🚀 Starting createChatFromTemplate() Demo");

  const { chatClient, projectDir } = await setupServices();

  // First, create the template file for the demo
  const templatePath = path.resolve(__dirname, "todo-template-for-demo.md");
  const templateContent = `--- 
type: "chat-template"
---

Create a plan for the following todo: $1

Additional context: $2

Arguments provided: $ARGUMENTS`;
  await fs.writeFile(templatePath, templateContent);
  logger.info(`Created demo template file at: ${templatePath}`);

  const args = [
    "Implement the new UI design for the settings page",
    "This is a high-priority task for the next sprint.",
  ];

  logger.info(`Using template: ${templatePath}`);
  logger.info(`With arguments: ${JSON.stringify(args)}`);

  try {
    const chatSession = await chatClient.createChatSessionFromTemplate(
      templatePath,
      projectDir,
      args,
    );

    logger.info("✅ Chat session created successfully from template!");
    logger.info(`   - Session ID: ${chatSession.id}`);
    logger.info(`   - File Path: ${chatSession.absoluteFilePath}`);

    const initialPrompt = chatSession.metadata?.promptDraft;

    if (initialPrompt) {
      logger.info("Initial prompt retrieved from session.metadata.prompt:");
      console.log("\n---\n" + initialPrompt + "\n---\n");
      logger.info(
        "The client can now use this prompt to start the conversation by calling sendMessage().",
      );
    } else {
      logger.warn("Could not find the initial prompt in the session metadata.");
    }
  } catch (error) {
    logger.error("❌ Demo failed:", error);
  } finally {
    // Clean up the created template file
    await fs.unlink(templatePath);
    logger.info(`Cleaned up demo template file: ${templatePath}`);
  }
}

runDemo();
