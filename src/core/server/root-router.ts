// src/core/server/root-router.ts
import path from "path";
import { type ILogObj, Logger } from "tslog";
import { ChatSessionRepositoryImpl } from "../services/chat/chat-session-repository.js";
import { FileWatcherService } from "../services/file-watcher-service.js";
import { createProjectFolderService } from "../services/project-folder-service.js";
import { ToolRegistryImpl } from "../services/tool-call/tool-registry.js";
import { createUserSettingsRepository } from "../services/user-settings-repository.js";
import { createUserSettingsService } from "../services/user-settings-service.js";
import { createModelService } from "../services/model-service.js";
import { createEventRouter } from "./routers/event-router.js";
import { createProjectFolderRouter } from "./routers/project-folder-router.js";
import { createFileRouter } from "./routers/file-router.js";
import { createUserSettingsRouter } from "./routers/user-settings-router.js";
import { createModelRouter } from "./routers/model-router.js";
import { createPromptScriptRouter } from "./routers/prompt-script-router.js";
import { createDocumentRouter } from "./routers/document-router.js";
import { router } from "./trpc-init.js";
import {
  PtyChatClient,
  type SnapshotProvider,
} from "../services/chat/pty-chat/pty-chat-client.js";
import { createPtyChatRouter } from "./routers/pty-chat-router.js";
// import { createChatCacheMiddleware } from "../services/chat-engine/chat-cache-middleware.js";
import type { PtyInstanceManager } from "../pty/pty-instance-manager.js";
import type { IEventBus } from "../event-bus.js";
import { ApiChatClient } from "../services/chat-engine/api-chat-client.js";
import { createApiChatRouter } from "./routers/api-chat-router.js";
import { PromptScriptRepository } from "../services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../services/prompt-script/prompt-script-service.js";
import { DocumentService } from "../services/document/document-service.js";
import { TerminalChatClient } from "../services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../services/external-chat/web-chat-client.js";
import { createChatRouter } from "./routers/chat-router.js";

interface TrpcRouterConfig {
  userDataDir: string;
  eventBus: IEventBus;
  ptyInstanceManager: PtyInstanceManager;
  snapshotProvider: SnapshotProvider;
}

export async function createTrpcRouter(config: TrpcRouterConfig) {
  const { userDataDir, eventBus, ptyInstanceManager, snapshotProvider } =
    config;

  // Setup logger
  const logger: Logger<ILogObj> = new Logger({ name: "AppServer" });

  // Create repositories
  const userSettingsRepo = createUserSettingsRepository(userDataDir);

  // Create services
  const fileWatcherService = new FileWatcherService(eventBus);

  const projectFolderService = createProjectFolderService(
    eventBus,
    userSettingsRepo,
    fileWatcherService,
  );

  const userSettingsService = createUserSettingsService(userSettingsRepo);

  const modelService = createModelService();

  // Load API keys to environment variables
  userSettingsService
    .loadApiKeysToEnvironment()
    .catch((err) =>
      logger.error("Failed to load API keys to environment:", err),
    );

  // Initialize tool registry
  // Note: ToolCallRunner is instantiated per chat session, not globally here.
  const toolRegistry = new ToolRegistryImpl(eventBus, logger);

  const databaseFilePath = path.join(
    userDataDir,
    "databases",
    "chat-sessions.db",
  );

  const chatSessionRepository = new ChatSessionRepositoryImpl({
    databaseFilePath,
  });

  // const chatCacheMiddleware = createChatCacheMiddleware(
  //   path.join(userDataDir, "chat-cache"),
  // );

  const apiChatClient = new ApiChatClient({
    repository: chatSessionRepository,
    eventBus,
    toolRegistry,
    // cacheMiddleware: chatCacheMiddleware,
  });

  const terminalChatClient = new TerminalChatClient(
    eventBus,
    chatSessionRepository,
  );
  const webChatClient = new WebChatClient(eventBus, chatSessionRepository);

  const ptyChatClient = new PtyChatClient(
    eventBus,
    chatSessionRepository,
    ptyInstanceManager,
    snapshotProvider,
  );

  const promptScriptRepository = new PromptScriptRepository();
  const promptScriptService = new PromptScriptService(
    promptScriptRepository,
    chatSessionRepository,
    // async () => {
    //   const settings = await userSettingsService.getUserSettings();
    //   return path.join(
    //     settings.project.defaultWorkspaceDirectory,
    //     settings.promptScript.promptScriptsSaveTo,
    //   );
    // },
  );

  const documentService = new DocumentService(promptScriptService);

  // Start watching all project folders
  projectFolderService
    .startWatchingAllProjectFolders()
    .catch((err) =>
      logger.error("Failed to start watching project folders:", err),
    );

  // Create the application router
  const appRouter = router({
    chat: createChatRouter({
      apiChatClient,
      terminalChatClient,
      webChatClient,
    }),
    apiChat: createApiChatRouter(apiChatClient),
    // toolCall: createToolCallRouter(toolCallScheduler, toolRegistry),
    ptyChat: createPtyChatRouter(ptyChatClient, chatSessionRepository),
    projectFolder: createProjectFolderRouter(projectFolderService),
    file: createFileRouter(documentService),
    event: createEventRouter(eventBus),
    userSettings: createUserSettingsRouter(userSettingsService),
    model: createModelRouter(modelService),
    document: createDocumentRouter(documentService),
    promptScript: createPromptScriptRouter(promptScriptService),
  });

  return {
    router: appRouter,
    fileWatcherService,
    projectFolderService,
  };
}

export type TrpcRouter = Awaited<ReturnType<typeof createTrpcRouter>>["router"];
export type CreateTrpcRouterResult = Awaited<
  ReturnType<typeof createTrpcRouter>
>;
