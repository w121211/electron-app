// src/core/services/external-chat/external-chat-client.ts
import { ILogObj, Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { parseChatTemplate } from "../../utils/chat-template-parser.js";
import { isTerminalModel } from "../../utils/model-utils.js";
import { ExternalChatSession } from "./external-chat-session.js";
import type { UserModelMessage } from "ai";
import type { IEventBus } from "../../event-bus.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type { TaskService } from "../task-service.js";
import type { ChatSessionRepository } from "../chat-engine/chat-session-repository.js";
import type {
  ChatMode,
  ChatSessionData,
} from "../chat-engine/chat-session-repository.js";
import type { ExternalTurnResult } from "./external-chat-session.js";

export interface CreateExternalChatSessionConfig {
  mode?: ChatMode;
  knowledge?: string[];
  promptDraft?: string;
  newTask?: boolean;
  modelId?: `${string}/${string}`;
}

export class ExternalChatClient {
  private readonly logger: Logger<ILogObj> = new Logger({ name: "ExternalChatClient" });
  private readonly externalSessions: Map<string, ExternalChatSession> = new Map();
  private readonly sessionAccessTime: Map<string, number> = new Map();
  private readonly maxSessions: number = 10;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly taskService: TaskService,
    private readonly projectFolderService: ProjectFolderService,
  ) {}

  async createExternalChatSessionFromTemplate(
    templatePath: string,
    targetDirectory: string,
    args: string[],
    config?: CreateExternalChatSessionConfig,
  ): Promise<ExternalChatSession> {
    const initialPrompt = await parseChatTemplate(templatePath, args);
    const modelId = config?.modelId;

    if (!modelId || !isTerminalModel(modelId)) {
      throw new Error("External chat requires a terminal model");
    }

    const session = await this.createExternalChatSession(targetDirectory, {
      ...config,
      promptDraft: initialPrompt,
      modelId,
    });

    return session;
  }

  async createExternalChatSession(
    targetDirectory: string,
    config?: CreateExternalChatSessionConfig,
  ): Promise<ExternalChatSession> {
    // Validate project folder
    const isInProjectFolder =
      await this.projectFolderService.isPathInProjectFolder(targetDirectory);

    if (!isInProjectFolder) {
      throw new Error(
        `Cannot create external chat outside of project folders. Path ${targetDirectory} is not within any registered project folder.`,
      );
    }

    // Create task if requested
    if (config?.newTask) {
      const result = await this.taskService.createTask(
        "New External Chat Task",
        {},
        targetDirectory,
      );
      targetDirectory = result.absoluteDirectoryPath;
    }

    const now = new Date();
    const externalSessionData: ChatSessionData = {
      _type: "external_chat",
      id: uuidv4(),
      absoluteFilePath: "", // Will be set by repository
      messages: [],
      modelId: config?.modelId || "openai/gpt-4o", // Default fallback
      sessionStatus: "idle",
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 20,
      createdAt: now,
      updatedAt: now,
      metadata: {
        mode: "external",
        knowledge: config?.knowledge || [],
        title: "New External Chat",
        promptDraft: config?.promptDraft,
        external: {
          mode: "terminal",
        },
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      externalSessionData,
    );
    externalSessionData.absoluteFilePath = filePath;

    const session = this.createExternalChatSessionFromData(externalSessionData);

    // Add to session pool
    this.externalSessions.set(session.absoluteFilePath, session);
    this.sessionAccessTime.set(session.absoluteFilePath, Date.now());

    return session;
  }

  async getOrLoadExternalChatSession(
    absoluteFilePath: string,
  ): Promise<ExternalChatSession> {
    // Check if it's an external session in memory
    if (this.externalSessions.has(absoluteFilePath)) {
      this.sessionAccessTime.set(absoluteFilePath, Date.now());
      return this.externalSessions.get(absoluteFilePath)!;
    }

    // Load from repository
    const chatSessionData =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    if (chatSessionData._type !== "external_chat") {
      throw new Error("Session is not an external chat session");
    }

    // Check session pool size and evict if necessary
    if (this.externalSessions.size >= this.maxSessions) {
      await this.evictLeastRecentlyUsedSession();
    }

    const session = this.createExternalChatSessionFromData(chatSessionData);

    // Add to session pool
    this.sessionAccessTime.set(absoluteFilePath, Date.now());

    return session;
  }

  async sendMessageToExternal(
    absoluteFilePath: string,
    chatSessionId: string,
    input: UserModelMessage,
  ): Promise<{
    turnResult: ExternalTurnResult;
    updatedExternalSession: ExternalChatSession;
  }> {
    const externalSession = await this.getOrLoadExternalChatSession(absoluteFilePath);

    if (externalSession.id !== chatSessionId) {
      throw new Error(
        `Session ID mismatch: expected ${externalSession.id}, got ${chatSessionId}`,
      );
    }

    const result = await externalSession.sendToExternal(input);

    // Reset prompt draft after successful message send
    if (externalSession.metadata) {
      externalSession.metadata.promptDraft = undefined;
    }

    await this.persistSession(externalSession);

    return {
      turnResult: result,
      updatedExternalSession: externalSession,
    };
  }

  async convertToExternalSession(
    _absoluteFilePath: string,
    existingSessionData: ChatSessionData,
  ): Promise<ExternalChatSession> {
    // Create external session data from AI session
    const externalSessionData: ChatSessionData = {
      _type: "external_chat",
      id: existingSessionData.id,
      absoluteFilePath: existingSessionData.absoluteFilePath,
      messages: existingSessionData.messages,
      modelId: existingSessionData.modelId,
      sessionStatus: "idle",
      fileStatus: existingSessionData.fileStatus,
      currentTurn: existingSessionData.currentTurn,
      maxTurns: existingSessionData.maxTurns,
      createdAt: existingSessionData.createdAt,
      updatedAt: new Date(),
      metadata: {
        ...existingSessionData.metadata,
        mode: "external",
      },
    };

    // Create external session
    const session = this.createExternalChatSessionFromData(externalSessionData);

    // Persist as external session
    await this.persistSession(session);

    return session;
  }

  async updateExternalChat(
    absoluteFilePath: string,
    updates: Partial<ChatSessionData>,
  ): Promise<void> {
    const session = await this.getOrLoadExternalChatSession(absoluteFilePath);

    // Handle metadata update safely
    if (updates.metadata) {
      const newMetadata = { ...updates.metadata };

      // Handle nested 'external' object safely
      if (newMetadata.external) {
        const currentExternal = session.metadata?.external || { mode: "terminal" }; // Default if not present
        // Merge 'external' object, preserving the original mode
        newMetadata.external = { ...currentExternal, ...newMetadata.external, mode: currentExternal.mode };
      }

      session.metadata = { ...session.metadata, ...newMetadata };
    }

    if (updates.maxTurns !== undefined) {
      session.maxTurns = updates.maxTurns;
    }
    if (updates.modelId !== undefined) {
      session.modelId = updates.modelId;
    }

    session.updatedAt = new Date();

    // Persist the session
    await this.persistSession(session);
  }

  async deleteExternalChat(absoluteFilePath: string): Promise<void> {
    const fs = await import("fs/promises");
    await fs.unlink(absoluteFilePath);

    const session = this.externalSessions.get(absoluteFilePath);
    if (session) {
      await session.cleanup();
    }

    this.externalSessions.delete(absoluteFilePath);
    this.sessionAccessTime.delete(absoluteFilePath);
  }

  async abortExternalChat(
    absoluteFilePath: string,
    chatSessionId: string,
  ): Promise<void> {
    const session = this.externalSessions.get(absoluteFilePath);
    if (session && session.id === chatSessionId) {
      await session.terminateExternal();
    }
  }

  private createExternalChatSessionFromData(
    data: ChatSessionData,
  ): ExternalChatSession {
    if (data._type !== "external_chat") {
      throw new Error("Data is not for external chat session");
    }

    const externalSession = new ExternalChatSession(data, this.eventBus, this.projectFolderService);

    // Add to session pool
    this.externalSessions.set(
      externalSession.absoluteFilePath,
      externalSession,
    );
    this.sessionAccessTime.set(externalSession.absoluteFilePath, Date.now());

    return externalSession;
  }

  private async evictLeastRecentlyUsedSession(): Promise<void> {
    let oldestTime = Date.now();
    let sessionToEvict: string | null = null;

    for (const [filePath, accessTime] of this.sessionAccessTime.entries()) {
      if (this.externalSessions.has(filePath) && accessTime < oldestTime) {
        oldestTime = accessTime;
        sessionToEvict = filePath;
      }
    }

    if (sessionToEvict) {
      const session = this.externalSessions.get(sessionToEvict);
      if (session) {
        await this.persistSession(session);
        await session.cleanup();
      }
      this.externalSessions.delete(sessionToEvict);
      this.sessionAccessTime.delete(sessionToEvict);
    }
  }

  private async persistSession(session: ExternalChatSession): Promise<void> {
    const sessionData = session.toJSON();
    await this.chatSessionRepository.saveToFile(
      sessionData.absoluteFilePath,
      sessionData,
    );
  }
}