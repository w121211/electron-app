// examples/chat-draft-service-demo.ts
// Run with: `pnpm tsx examples/chat-draft-service-demo.ts`

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { Logger } from "tslog";
import type { ILogObj } from "tslog";
import { EventBus } from "../src/core/event-bus.js";
import { ChatSessionRepositoryImpl } from "../src/core/services/chat-engine/chat-session-repository.js";
import { ChatDraftService } from "../src/core/services/chat-engine/chat-draft-service.js";
import { ApiChatClient as ChatEngineClient } from "../src/core/services/chat-engine/api-chat-client.js";
import { ToolRegistryImpl } from "../src/core/services/tool-call/tool-registry.js";
import { TaskService } from "../src/core/services/task-service.js";
import { TaskRepository } from "../src/core/services/task-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";
import { UserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { UserSettingsService } from "../src/core/services/user-settings-service.js";
import { createPtyInstanceManager } from "../src/core/services/pty/pty-instance-manager.js";
import { PtyChatClient } from "../src/core/services/pty/pty-chat-client.js";

const logger = new Logger<ILogObj>({ name: "ChatDraftServiceDemo" });
const eventBus = new EventBus({ environment: "server", logger });

interface DemoContext {
  projectDir: string;
  chatDraftService: ChatDraftService;
  chatClient: ChatEngineClient<any>;
  ptyChatClient: PtyChatClient;
}

async function setupDemo(): Promise<DemoContext> {
  const projectDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "chat-draft-demo-"),
  );

  const userSettingsRepository = new UserSettingsRepository(
    path.join(projectDir, "user-settings.json"),
  );
  const fileWatcherService = new FileWatcherService(eventBus);
  const projectFolderService = new ProjectFolderService(
    eventBus,
    userSettingsRepository,
    fileWatcherService,
  );
  await projectFolderService.addProjectFolder(projectDir);

  const taskService = new TaskService(eventBus, new TaskRepository());
  const chatSessionRepository = new ChatSessionRepositoryImpl();
  const chatDraftService = new ChatDraftService(
    chatSessionRepository,
    taskService,
    projectFolderService,
  );

  const userSettingsService = new UserSettingsService(userSettingsRepository);
  const toolRegistry = new ToolRegistryImpl(eventBus, logger);

  const chatClient = new ChatEngineClient(
    eventBus,
    chatSessionRepository,
    chatDraftService,
    userSettingsService,
    toolRegistry,
  );

  const ptyInstanceManager = createPtyInstanceManager(eventBus);
  const ptyChatClient = new PtyChatClient(
    eventBus,
    chatSessionRepository,
    projectFolderService,
    ptyInstanceManager,
  );

  return {
    projectDir,
    chatDraftService,
    chatClient,
    ptyChatClient,
  };
}

async function demoDraftToChatEngine(ctx: DemoContext): Promise<void> {
  logger.info("--- Draft ➜ Chat Engine session ---");
  const draft = await ctx.chatDraftService.createDraft(ctx.projectDir, {
    mode: "agent",
    promptDraft: "Summarize the latest project updates.",
  });
  logger.info("Draft created", {
    file: draft.absoluteFilePath,
    type: draft._type,
    modelId: draft.modelId ?? "<unset>",
  });

  const engineSession = await ctx.chatClient.activateDraft(
    draft.absoluteFilePath,
    "openai/gpt-4o",
  );

  const sessionData = engineSession.toJSON();
  logger.info("Draft promoted to chat engine session", {
    type: sessionData._type,
    modelId: sessionData.modelId,
    status: sessionData.sessionStatus,
    messages: sessionData.messages.length,
  });

  await ctx.chatClient.deleteChat(sessionData.absoluteFilePath);
}

async function demoDraftToPty(ctx: DemoContext): Promise<void> {
  logger.info("--- Draft ➜ PTY session ---");
  const draft = await ctx.chatDraftService.createDraft(ctx.projectDir, {
    mode: "agent",
    promptDraft: "echo 'running from draft'",
  });

  logger.info("Draft created", {
    file: draft.absoluteFilePath,
    type: draft._type,
  });

  const prompt = draft.metadata?.promptDraft ?? "echo 'no prompt'";
  const ptySession = await ctx.ptyChatClient.createFromDraft(
    draft.absoluteFilePath,
    prompt,
    "cli/codex",
  );

  logger.info("PTY session started", {
    type: ptySession.toJSON()._type,
    status: ptySession.sessionStatus,
    ptyInstanceId: ptySession.ptyInstanceId,
  });

  await ctx.ptyChatClient.deletePtyChat(ptySession.absoluteFilePath);
}

async function run(): Promise<void> {
  const ctx = await setupDemo();

  try {
    await demoDraftToChatEngine(ctx);
    await demoDraftToPty(ctx);
  } catch (error) {
    logger.error("Demo failed", error);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  logger.error("Unexpected failure", error);
  process.exit(1);
});
