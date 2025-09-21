// src/core/services/pty/pty-chat-client.ts
import { ILogObj, Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import type { PtySessionManager } from "./pty-session-manager.js";
import type { IEventBus } from "../../event-bus.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type {
  ChatSessionRepository,
  ChatSessionData,
} from "../chat-engine/chat-session-repository.js";
import { PtyChatSession } from "./pty-chat-session.js";
import type { PtyChatUpdatedEvent } from "./events.js";
import type { PtyChatUpdateType, PtyChatUpdate } from "./pty-chat-session.js";
import { isTerminalModel } from "../../utils/model-utils.js";

export class PtyChatClient {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "PtyChatClient",
  });
  private readonly sessions = new Map<
    string,
    { session: PtyChatSession; ptyInstanceId?: string }
  >();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly projectFolderService: ProjectFolderService,
    private readonly ptySessionManager: PtySessionManager,
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(
      "PtyChatUpdatedEvent",
      async (event: PtyChatUpdatedEvent) => {
        await this.handlePtyChatSessionUpdate(
          event.session,
          event.updateType,
          event.update,
        );
      },
    );
  }

  async createPtyChatSession(
    targetDirectory: string,
    options: {
      initialPrompt?: string;
      modelId: `${string}/${string}`;
    },
  ): Promise<PtyChatSession> {
    this.logger.info("Creating new PTY chat session");

    const ptyInstance = this.ptySessionManager.create({ cwd: targetDirectory });

    const now = new Date();
    const sessionData: ChatSessionData = {
      _type: "pty_chat",
      id: uuidv4(),
      absoluteFilePath: "", // Will be set by repository
      messages: [],
      modelId: options.modelId,
      sessionStatus: "external_active",
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 1000, // High limit for PTY sessions
      createdAt: now,
      updatedAt: now,
      metadata: {
        mode: "pty",
        title: "PTY Session",
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      sessionData,
    );
    sessionData.absoluteFilePath = filePath;

    const session = new PtyChatSession(sessionData, this.eventBus);
    session.ptyInstanceId = ptyInstance.id;

    this.sessions.set(session.absoluteFilePath, {
      session,
      ptyInstanceId: session.ptyInstanceId,
    });

    if (options.initialPrompt) {
      ptyInstance.write(options.initialPrompt + "\n");
    }

    return session;
  }

  async createFromDraft(
    absoluteFilePath: string,
    initialPrompt: string,
    modelId: `${string}/${string}`,
  ): Promise<PtyChatSession> {
    this.logger.info(`Creating PTY session from draft: ${absoluteFilePath}`);

    if (!isTerminalModel(modelId)) {
      throw new Error(
        `Invalid model for PTY session: ${modelId}. Model must be a terminal model.`,
      );
    }

    const existingData =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    if (existingData.messages.length > 0) {
      throw new Error(
        `Cannot create PTY session from draft with existing messages. Session must be empty.`,
      );
    }

    const targetDirectory =
      await this.projectFolderService.getProjectFolderForPath(
        existingData.absoluteFilePath,
      );

    if (!targetDirectory) {
      throw new Error(
        `Chat file ${existingData.absoluteFilePath} is not within any project folder`,
      );
    }

    const ptyInstance = this.ptySessionManager.create({ cwd: targetDirectory.path });

    existingData._type = "pty_chat";
    existingData.sessionStatus = "external_active";
    existingData.modelId = modelId;
    existingData.metadata = {
      ...existingData.metadata,
      mode: "pty",
    };
    existingData.updatedAt = new Date();

    await this.chatSessionRepository.saveToFile(
      existingData.absoluteFilePath,
      existingData,
    );

    ptyInstance.write(initialPrompt + "\n");

    const session = new PtyChatSession(existingData, this.eventBus);
    session.ptyInstanceId = ptyInstance.id;

    this.sessions.set(session.absoluteFilePath, {
      session,
      ptyInstanceId: session.ptyInstanceId,
    });

    return session;
  }

  async getOrLoadPtyChatSession(
    absoluteFilePath: string,
  ): Promise<PtyChatSession> {
    const session = this.sessions.get(absoluteFilePath);
    if (session) {
      return session.session;
    }

    const data =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);
    const newSession = new PtyChatSession(data, this.eventBus);
    this.sessions.set(newSession.absoluteFilePath, {
      session: newSession,
      ptyInstanceId: newSession.ptyInstanceId,
    });
    return newSession;
  }

  async deleteSession(absoluteFilePath: string): Promise<void> {
    const session = this.sessions.get(absoluteFilePath);
    if (session) {
      if (session.ptyInstanceId) {
        const instance = this.ptySessionManager.getSession(session.ptyInstanceId);
        instance?.kill();
      }
      this.sessions.delete(absoluteFilePath);
    }
    await this.chatSessionRepository.deleteFile(absoluteFilePath);
  }

  async findSessionByPtyInstanceId(
    ptyInstanceId: string,
  ): Promise<PtyChatSession | null> {
    for (const {
      session,
      ptyInstanceId: storedPtyInstanceId,
    } of this.sessions.values()) {
      if (storedPtyInstanceId === ptyInstanceId) {
        return session;
      }
    }
    return null;
  }

  private async handlePtyChatSessionUpdate(
    session: PtyChatSession,
    updateType: PtyChatUpdateType,
    update: PtyChatUpdate,
  ): Promise<void> {
    const payload = session.toJSON();

    await this.chatSessionRepository.saveToFile(
      session.absoluteFilePath,
      payload,
    );

    await this.eventBus.emit({
      kind: "PtyChatSessionUpdated",
      chatId: session.id,
      updateType,
      update,
      chat: payload,
      timestamp: new Date(),
    });
  }
}
