// src/core/server/root-router.ts
import { ILogObj, Logger } from "tslog";
// import type { IEventBus } from "../event-bus.js";
import { ChatSessionRepositoryImpl } from "../services/chat-engine/chat-session-repository.js";
import { FileWatcherService } from "../services/file-watcher-service.js";
import { createProjectFolderService } from "../services/project-folder-service.js";
import { TaskRepository } from "../services/task-repository.js";
import { TaskService } from "../services/task-service.js";
// import { ToolCallScheduler } from "../services/tool-call/tool-call-scheduler.js";
import { ToolRegistryImpl } from "../services/tool-call/tool-registry.js";
// import { ApprovalMode } from "../services/tool-call/types.js";
import { createUserSettingsRepository } from "../services/user-settings-repository.js";
import { createUserSettingsService } from "../services/user-settings-service.js";
import { createModelService } from "../services/model-service.js";
import { createEventRouter } from "./routers/event-router.js";
import { createTaskRouter } from "./routers/task-router.js";
import { createProjectFolderRouter } from "./routers/project-folder-router.js";
import { createFileRouter } from "./routers/file-router.js";
import { createUserSettingsRouter } from "./routers/user-settings-router.js";
import { createModelRouter } from "./routers/model-router.js";
// import { createToolCallRouter } from "./routers/tool-call-router.js";
import { createChatClientRouter } from "./routers/chat-client-router.js";
import { router } from "./trpc-init.js";
import { PtyChatClient } from "../services/pty/pty-chat-client.js";
import { createPtyChatRouter } from "./routers/pty-chat-router.js";
import type { PtyInstanceManager } from "../services/pty/pty-instance-manager.js";
import type { IEventBus } from "../event-bus.js";

interface TrpcRouterConfig {
  userDataDir: string;
  eventBus: IEventBus;
  ptyInstanceManager: PtyInstanceManager;
}

export async function createTrpcRouter(config: TrpcRouterConfig) {
  const { userDataDir, eventBus, ptyInstanceManager } = config;

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

  // Create task repository
  const taskRepo = new TaskRepository();

  // Initialize task repository with any existing tasks
  // projectFolderService.getAllProjectFolders();
  // .then(async (folders) => {
  //   for (const folder of folders) {
  //     await taskRepo.scanFolder(folder.path);
  //   }
  //   logger.info(`Task repository initialized with folders`);
  // })
  // .catch((err) =>
  //   logger.error(
  //     "Failed to initialize task repository with project folders:",
  //     err
  //   )
  // );

  const taskService = new TaskService(eventBus, taskRepo);

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

  // Initialize chat session repository
  const chatSessionRepository = new ChatSessionRepositoryImpl();

  const ptyChatClient = new PtyChatClient(
    eventBus,
    chatSessionRepository,
    projectFolderService,
    ptyInstanceManager,
  );

  // Start watching all project folders
  projectFolderService
    .startWatchingAllProjectFolders()
    .catch((err) =>
      logger.error("Failed to start watching project folders:", err),
    );

  // Create the application router
  return router({
    task: createTaskRouter(taskService),
    chatClient: createChatClientRouter(
      eventBus,
      taskService,
      projectFolderService,
      userSettingsService,
      toolRegistry,
      chatSessionRepository,
      ptyChatClient,
    ),
    ptyChat: createPtyChatRouter(ptyChatClient),
    projectFolder: createProjectFolderRouter(projectFolderService),
    file: createFileRouter(),
    event: createEventRouter(eventBus),
    userSettings: createUserSettingsRouter(userSettingsService),
    model: createModelRouter(modelService),
    // toolCall: createToolCallRouter(toolCallScheduler, toolRegistry),
  });
}

export type TrpcRouter = Awaited<ReturnType<typeof createTrpcRouter>>;
