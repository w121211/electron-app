// src/core/services/chat-engine/chat-client.ts
import { ILogObj, Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import type { StreamTextResult, ToolSet, UserModelMessage } from "ai";
import { ChatSession } from "./chat-session.js";
import type { IEventBus } from "../../event-bus.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type { TaskService } from "../task-service.js";
import type { UserSettingsService } from "../user-settings-service.js";
import type { ToolCallConfirmationOutcome } from "../tool-call/tool-call-confirmation.js";
import type { ToolExecutionResult } from "../tool-call/tool-call-runner.js";
import type { ToolRegistry } from "../tool-call/tool-registry.js";
import type { TurnResult } from "./chat-session.js";
import type {
  ChatMode,
  ChatSessionData,
  ChatSessionRepository,
} from "./chat-session-repository.js";
import { ExternalChatSession } from "./external-chat-session.js";
import type { ExternalTurnResult } from "./external-chat-session.js";


// const DEFAULT_MODEL_ID = "anthropic:claude-3-sonnet"; // Format: `providerId:modelId`
const DEFAULT_MODEL_ID = "openai/gpt-4o"; // Gateway model id format: `providerId/modelId`

export interface CreateChatSessionConfig {
  mode?: ChatMode;
  knowledge?: string[];
  prompt?: string;
  newTask?: boolean;
  modelId?: `${string}/${string}`;
}

export class ChatClient<TOOLS extends ToolSet> {
  private readonly logger: Logger<ILogObj> = new Logger({ name: "ChatClient" });
  private readonly sessions: Map<string, ChatSession<TOOLS>> = new Map();
  private readonly externalSessions: Map<string, ExternalChatSession> = new Map();
  private readonly sessionAccessTime: Map<string, number> = new Map();
  private readonly maxSessions: number = 10;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly taskService: TaskService,
    private readonly projectFolderService: ProjectFolderService,
    private readonly userSettingsService: UserSettingsService,
    private readonly toolRegistry: ToolRegistry,
    // private readonly providerRegistry: ProviderRegistryProvider,
  ) {}

  async sendMessage(
    absoluteFilePath: string,
    chatSessionId: string,
    input: UserModelMessage | ToolExecutionResult<TOOLS>,
  ): Promise<{
    turnResult: TurnResult<TOOLS>;
    updatedChatSession: ChatSession<TOOLS>;
  }> {
    const session = await this.getOrLoadChatSession(absoluteFilePath);
    
    if (session instanceof ExternalChatSession) {
      throw new Error("Cannot send AI messages to external chat sessions");
    }

    if (session.id !== chatSessionId) {
      throw new Error(
        `Session ID mismatch: expected ${session.id}, got ${chatSessionId}`,
      );
    }

    // Handle user message or tool execution result
    let result = await session.runTurn(input);

    while (true) {
      await this.persistSession(session);

      // If output has tool calls awaiting confirmation, return early
      if (
        result.toolCallsAwaitingConfirmation !== undefined &&
        result.toolCallsAwaitingConfirmation.length > 0
      ) {
        return {
          turnResult: result,
          updatedChatSession: session,
        };
      }

      // Check next speaker
      const nextSpeaker = session.checkNextSpeaker();

      if (nextSpeaker !== "agent") {
        break;
      }

      // Mock human input for agent continuation
      const mockHumanInput: UserModelMessage = {
        role: "user",
        content: "Continue.",
      };

      result = await session.runTurn(mockHumanInput);
    }

    return {
      turnResult: result,
      updatedChatSession: session,
    };
  }

  // TODO: Create a backup of the current session before rerun to prevent data loss.
  async rerunChat(
    absoluteFilePath: string,
    chatSessionId: string,
  ): Promise<TurnResult<TOOLS>> {
    const session = await this.getOrLoadChatSession(absoluteFilePath);
    
    if (session instanceof ExternalChatSession) {
      throw new Error("Cannot rerun external chat sessions");
    }

    if (session.id !== chatSessionId) {
      throw new Error(
        `Session ID mismatch: expected ${session.id}, got ${chatSessionId}`,
      );
    }

    // Store user messages before clearing
    const userMessages = session.messages.filter(
      (msg) => msg.message.role === "user",
    );

    // Reset session state and clear messages
    session.currentTurn = 0;
    session.sessionStatus = "idle";
    session.messages = [];

    if (userMessages.length === 0) {
      throw new Error("No user messages found in session history to rerun");
    }

    let lastResult: TurnResult<TOOLS> | null = null;

    // Iterate through each user message in the conversation history
    for (const userMessage of userMessages) {
      // Use the ModelMessage directly from the ChatMessage
      const modelMessage = userMessage.message;
      if (modelMessage.role === "user") {
        lastResult = await session.runTurn(modelMessage);
      }

      // If session reaches max turns or other stopping condition, break
      if (lastResult?.sessionStatus === "max_turns_reached") {
        break;
      }
    }

    await this.persistSession(session);

    return lastResult!;
  }

  async confirmToolCall(
    absoluteFilePath: string,
    chatSessionId: string,
    toolCallId: string,
    outcome: ToolCallConfirmationOutcome,
  ): Promise<{
    turnResult: TurnResult<TOOLS>;
    updatedChatSession: ChatSession<TOOLS>;
  }> {
    const session = await this.getOrLoadChatSession(absoluteFilePath);
    
    if (session instanceof ExternalChatSession) {
      throw new Error("Cannot confirm tool calls on external chat sessions");
    }

    if (session.id !== chatSessionId) {
      throw new Error(
        `Session ID mismatch: expected ${session.id}, got ${chatSessionId}`,
      );
    }

    if (session.sessionStatus !== "waiting_confirmation") {
      throw new Error("Session is not waiting for tool confirmation");
    }

    // Get tool execution result from confirmation
    const toolExecutionResult = await session.confirmToolCall(
      toolCallId,
      outcome,
    );

    if (toolExecutionResult.status === "awaiting_confirmations") {
      // Still awaiting more confirmations, persist session and return current state
      await this.persistSession(session);
      const turnResult: TurnResult<TOOLS> = {
        sessionStatus: session.sessionStatus,
        streamResult: {} as StreamTextResult<TOOLS, never>, // This will be updated when we support proper streaming
        currentTurn: session.currentTurn,
        toolCallsAwaitingConfirmation:
          toolExecutionResult.toolCallsAwaitingConfirmation,
      };
      return {
        turnResult,
        updatedChatSession: session,
      };
    }

    // Route through sendMessage with tool execution result - unified entry point
    return await this.sendMessage(
      absoluteFilePath,
      chatSessionId,
      toolExecutionResult,
    );
  }

  async abortChat(
    absoluteFilePath: string,
    chatSessionId: string,
  ): Promise<void> {
    const session = this.sessions.get(absoluteFilePath);
    if (session && session.id === chatSessionId) {
      session.abort();
    }
  }

  async createChatSession(
    targetDirectory: string,
    config?: CreateChatSessionConfig,
  ): Promise<ChatSession<TOOLS>> {
    // Validate project folder
    const isInProjectFolder =
      await this.projectFolderService.isPathInProjectFolder(targetDirectory);

    if (!isInProjectFolder) {
      throw new Error(
        `Cannot create chat outside of project folders. Path ${targetDirectory} is not within any registered project folder.`,
      );
    }

    // Create task if requested
    if (config?.newTask) {
      const result = await this.taskService.createTask(
        "New Chat Task",
        {},
        targetDirectory,
      );
      targetDirectory = result.absoluteDirectoryPath;
    }

    // if (this.providerRegistry === null) {
    //   throw new Error("Provider registry not initialized");
    // }

    const now = new Date();
    const chatSessionData: ChatSessionData = {
      _type: "chat",
      id: uuidv4(),
      absoluteFilePath: "", // Will be set by repository
      messages: [],
      modelId: DEFAULT_MODEL_ID,
      sessionStatus: "idle",
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 20,
      createdAt: now,
      updatedAt: now,
      metadata: {
        mode: config?.mode || "chat",
        knowledge: config?.knowledge || [],
        title: "New Chat",
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      chatSessionData,
    );
    chatSessionData.absoluteFilePath = filePath;

    const session = this.createChatSessionFromData(chatSessionData);
    
    if (session instanceof ExternalChatSession) {
      throw new Error("Expected ChatSession but got ExternalChatSession");
    }
    
    const chatSession = session;

    // Add to session pool
    this.sessions.set(chatSession.absoluteFilePath, chatSession);
    this.sessionAccessTime.set(chatSession.absoluteFilePath, Date.now());

    return chatSession;
  }

  async createNewExternalChatSession(
    targetDirectory: string,
    modelId: `${string}/${string}`,
    config?: CreateChatSessionConfig,
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
      modelId,
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
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      externalSessionData,
    );
    externalSessionData.absoluteFilePath = filePath;

    const session = this.createChatSessionFromData(externalSessionData);
    
    if (!(session instanceof ExternalChatSession)) {
      throw new Error("Expected ExternalChatSession but got ChatSession");
    }
    
    const externalSession = session;

    return externalSession;
  }

  async getOrLoadChatSession(
    absoluteFilePath: string,
  ): Promise<ChatSession<TOOLS> | ExternalChatSession> {
    // Check if it's a regular session in memory
    if (this.sessions.has(absoluteFilePath)) {
      this.sessionAccessTime.set(absoluteFilePath, Date.now());
      return this.sessions.get(absoluteFilePath)!;
    }
    
    // Check if it's an external session in memory
    if (this.externalSessions.has(absoluteFilePath)) {
      this.sessionAccessTime.set(absoluteFilePath, Date.now());
      return this.externalSessions.get(absoluteFilePath)!;
    }

    // Load from repository and determine type
    const chatSessionData =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    // Check session pool size and evict if necessary
    if (chatSessionData._type === "external_chat") {
      if (this.externalSessions.size >= this.maxSessions) {
        await this.evictLeastRecentlyUsedExternalSession();
      }
    } else {
      if (this.sessions.size >= this.maxSessions) {
        await this.evictLeastRecentlyUsedSession();
      }
    }

    const session = this.createChatSessionFromData(chatSessionData);
    
    // Session is already added to appropriate pool by createChatSessionFromData
    this.sessionAccessTime.set(absoluteFilePath, Date.now());
    
    return session;
  }

  async updateChat(
    absoluteFilePath: string,
    updates: Partial<ChatSessionData>,
  ): Promise<void> {
    const session = await this.getOrLoadChatSession(absoluteFilePath);

    if (updates.metadata) {
      session.metadata = { ...session.metadata, ...updates.metadata };
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

  async deleteChat(absoluteFilePath: string): Promise<void> {
    const fs = await import("fs/promises");
    await fs.unlink(absoluteFilePath);

    const session = this.sessions.get(absoluteFilePath);
    if (session) {
      await session.cleanup();
    }

    this.sessions.delete(absoluteFilePath);
    this.sessionAccessTime.delete(absoluteFilePath);
  }

  async sendMessageToExternal(
    absoluteFilePath: string,
    chatSessionId: string,
    input: UserModelMessage,
  ): Promise<{
    turnResult: ExternalTurnResult;
    updatedExternalSession: ExternalChatSession;
  }> {
    let externalSession: ExternalChatSession;

    // Check if we need to convert from AI session
    if (this.sessions.has(absoluteFilePath)) {
      externalSession = await this.convertToExternalSession(absoluteFilePath);
    } else {
      const loadedSession = await this.getOrLoadChatSession(absoluteFilePath);
      if (!(loadedSession instanceof ExternalChatSession)) {
        throw new Error("Expected ExternalChatSession but got ChatSession");
      }
      externalSession = loadedSession;
    }

    if (externalSession.id !== chatSessionId) {
      throw new Error(
        `Session ID mismatch: expected ${externalSession.id}, got ${chatSessionId}`,
      );
    }

    const result = await externalSession.sendToExternal(input);
    await this.persistSession(externalSession);

    return {
      turnResult: result,
      updatedExternalSession: externalSession,
    };
  }

  async convertToExternalSession(
    absoluteFilePath: string,
  ): Promise<ExternalChatSession> {
    const loadedSession = await this.getOrLoadChatSession(absoluteFilePath);
    
    if (loadedSession instanceof ExternalChatSession) {
      return loadedSession; // Already an external session
    }
    
    const aiSession = loadedSession;

    // Create external session data from AI session
    const externalSessionData: ChatSessionData = {
      _type: "external_chat",
      id: aiSession.id,
      absoluteFilePath: aiSession.absoluteFilePath,
      messages: aiSession.messages,
      modelId: aiSession.modelId,
      sessionStatus: "idle",
      fileStatus: aiSession.fileStatus,
      currentTurn: aiSession.currentTurn,
      maxTurns: aiSession.maxTurns,
      createdAt: aiSession.createdAt,
      updatedAt: new Date(),
      metadata: {
        ...aiSession.metadata,
        mode: "external",
      },
    };

    // Create external session
    const session = this.createChatSessionFromData(externalSessionData);
    
    if (!(session instanceof ExternalChatSession)) {
      throw new Error("Expected ExternalChatSession but got ChatSession");
    }
    
    const externalSession = session;

    // Remove from AI session pool and cleanup
    const aiSessionInstance = this.sessions.get(absoluteFilePath);
    if (aiSessionInstance) {
      await aiSessionInstance.cleanup();
    }
    this.sessions.delete(absoluteFilePath);

    // Persist as external session
    await this.persistSession(externalSession);

    return externalSession;
  }



  private createChatSessionFromData(data: ChatSessionData): ChatSession<TOOLS> | ExternalChatSession {
    if (data._type === "external_chat") {
      const externalSession = new ExternalChatSession(data, this.eventBus);
      
      // Add to session pool
      this.externalSessions.set(externalSession.absoluteFilePath, externalSession);
      this.sessionAccessTime.set(externalSession.absoluteFilePath, Date.now());
      
      return externalSession;
    }
    
    const chatSession = new ChatSession<TOOLS>(
      data,
      this.toolRegistry,
      this.eventBus,
      // this.providerRegistry,
    );

    return chatSession;
  }

  private async evictLeastRecentlyUsedSession(): Promise<void> {
    let oldestTime = Date.now();
    let sessionToEvict: string | null = null;

    for (const [filePath, accessTime] of this.sessionAccessTime.entries()) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        sessionToEvict = filePath;
      }
    }

    if (sessionToEvict) {
      const session = this.sessions.get(sessionToEvict);
      if (session) {
        await this.persistSession(session);
        await session.cleanup();
      }
      this.sessions.delete(sessionToEvict);
      this.sessionAccessTime.delete(sessionToEvict);
    }
  }


  private async evictLeastRecentlyUsedExternalSession(): Promise<void> {
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

  private async persistSession(session: ChatSession<TOOLS> | ExternalChatSession): Promise<void> {
    const sessionData = session.toJSON();
    await this.chatSessionRepository.saveToFile(
      sessionData.absoluteFilePath,
      sessionData,
    );
  }
}
