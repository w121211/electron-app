// src/core/services/pty/pty-chat-client.ts
import { ILogObj, Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { ptySessionManager } from "../pty-session-manager.js";
import type { IEventBus } from "../../event-bus.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type { ChatSessionRepository } from "../chat-engine/chat-session-repository.js";
import type { ChatSessionData } from "../chat-engine/chat-session-repository.js";
import { PtyChatSession } from "./pty-chat-session.js";

export class PtyChatClient {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "PtyChatClient",
  });
  private readonly sessions: Map<string, PtyChatSession> = new Map();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly projectFolderService: ProjectFolderService,
  ) {}

  async createPtyChatSession(
    targetDirectory: string,
    initialCommand?: string,
  ): Promise<PtyChatSession> {
    this.logger.info("Creating new PTY chat session");

    const ptyInstance = ptySessionManager.create({ cwd: targetDirectory });

    const now = new Date();
    const sessionData: ChatSessionData = {
      _type: "pty_chat",
      id: uuidv4(),
      absoluteFilePath: "", // Will be set by repository
      messages: [],
      modelId: "pty/local-shell",
      sessionStatus: "external_active",
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 1000, // High limit for PTY sessions
      createdAt: now,
      updatedAt: now,
      metadata: {
        mode: "external",
        title: "PTY Session",
        pty: {
          sessionId: ptyInstance.id,
        },
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      sessionData,
    );
    sessionData.absoluteFilePath = filePath;

    if (initialCommand) {
      ptyInstance.write(initialCommand + "\n");
    }

    const session = new PtyChatSession(
      sessionData,
      this.eventBus,
      this.projectFolderService,
    );
    this.sessions.set(session.id, session);

    return session;
  }

  async startFromDraft(
    chatId: string,
    initialCommand: string,
  ): Promise<PtyChatSession> {
    this.logger.info(`Starting PTY session from draft: ${chatId}`);

    const existingData = await this.chatSessionRepository.loadFromFile(chatId);
    const targetDirectory =
      await this.projectFolderService.getProjectFolderForPath(
        existingData.absoluteFilePath,
      );

    if (!targetDirectory) {
      throw new Error(
        `Chat file ${existingData.absoluteFilePath} is not within any project folder`,
      );
    }

    const ptyInstance = ptySessionManager.create({ cwd: targetDirectory.path });

    existingData._type = "pty_chat";
    existingData.sessionStatus = "external_active";
    existingData.metadata = {
      ...existingData.metadata,
      mode: "external",
      pty: {
        sessionId: ptyInstance.id,
      },
    };
    existingData.updatedAt = new Date();

    await this.chatSessionRepository.saveToFile(
      existingData.absoluteFilePath,
      existingData,
    );

    ptyInstance.write(initialCommand + "\n");

    const session = new PtyChatSession(
      existingData,
      this.eventBus,
      this.projectFolderService,
    );
    this.sessions.set(session.id, session);

    return session;
  }
}
