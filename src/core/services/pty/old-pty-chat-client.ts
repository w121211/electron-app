// src/core/services/pty/pty-chat-client.ts
import { ILogObj, Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { merge } from "es-toolkit";
import type {
  PtyInstanceManager,
  PtyInstance,
} from "./pty-instance-manager.js";
import type { IEventBus } from "../../event-bus.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type {
  ChatSessionRepository,
  ChatSessionData,
} from "../chat/chat-session-repository.js";
import { PtyChatSession } from "./pty-chat-session.js";
import type { PtyChatUpdatedEvent } from "./events.js";
import type { PtyChatUpdateType, PtyChatUpdate } from "./pty-chat-session.js";
import {
  isTerminalModel,
  buildCliModelCommand,
} from "../../utils/model-utils.js";

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
    private readonly ptyInstanceManager: PtyInstanceManager,
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

  async createPtyChat(
    targetDirectory: string,
    options: {
      initialPrompt?: string;
      modelId: `${string}/${string}`;
    },
  ): Promise<PtyChatSession> {
    this.logger.info("Creating new PTY chat session");

    const now = new Date();
    const sessionData: ChatSessionData = {
      _type: "pty_chat",
      id: uuidv4(),
      absoluteFilePath: "", // Will be set by repository
      messages: [],
      modelId: options.modelId,
      sessionStatus: "idle", // Draft state
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 1000, // High limit for PTY sessions
      createdAt: now,
      updatedAt: now,
      metadata: {
        // title: "PTY Session",
        external: {
          workingDirectory: targetDirectory,
          pty: {},
        },
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      targetDirectory,
      sessionData,
    );
    sessionData.absoluteFilePath = filePath;

    const session = new PtyChatSession(sessionData, this.eventBus);

    // Only create PTY instance if initialPrompt is provided
    if (options.initialPrompt) {
      const ptyInstance = this.ptyInstanceManager.create({
        cwd: targetDirectory,
      });
      session.attachPtyInstance(ptyInstance.id);
      const cliCommand = buildCliModelCommand(
        options.modelId,
        options.initialPrompt,
      );
      ptyInstance.write(cliCommand + "\n");
    }

    this.sessions.set(session.absoluteFilePath, {
      session,
      ptyInstanceId: session.ptyInstanceId,
    });

    return session;
  }

  async createFromDraft(
    absoluteFilePath: string,
    initialPrompt: string,
    modelId: `${string}/${string}`,
  ): Promise<PtyChatSession> {
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

    const ptyInstance = this.ptyInstanceManager.create({
      cwd: targetDirectory.path,
    });

    const session = new PtyChatSession(existingData, this.eventBus);
    session.attachPtyInstance(ptyInstance.id);
    session.sessionStatus = "external_active";
    session.modelId = modelId;
    session.workingDirectory = targetDirectory.path;
    session.updatedAt = new Date();

    const cliCommand = buildCliModelCommand(modelId, initialPrompt);
    session.metadata = {
      ...session.metadata,
      external: {
        ...session.metadata?.external,
        pty: {
          ...session.metadata?.external?.pty,
          initialCommand: cliCommand,
        },
      },
    };

    await this.chatSessionRepository.saveToFile(
      existingData.absoluteFilePath,
      session.toJSON(),
    );

    this.sessions.set(session.absoluteFilePath, {
      session,
      ptyInstanceId: session.ptyInstanceId,
    });

    return session;
  }

  async getOrLoadPtyChat(absoluteFilePath: string): Promise<PtyChatSession> {
    const session = this.sessions.get(absoluteFilePath);
    if (session) {
      return session.session;
    }

    const data =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    // Get existing PTY instance or clean stale reference
    const ptyInstance = await this.getOrCleanPtyInstance(data);

    const newSession = new PtyChatSession(data, this.eventBus);

    // If PTY instance exists, attach it
    if (ptyInstance) {
      newSession.attachPtyInstance(ptyInstance.id);
    }

    this.sessions.set(newSession.absoluteFilePath, {
      session: newSession,
      ptyInstanceId: newSession.ptyInstanceId,
    });
    return newSession;
  }

  async deletePtyChat(absoluteFilePath: string): Promise<void> {
    const session = this.sessions.get(absoluteFilePath);
    if (session) {
      if (session.ptyInstanceId) {
        const instance = this.ptyInstanceManager.getSession(
          session.ptyInstanceId,
        );
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

  private async getOrCleanPtyInstance(
    sessionData: ChatSessionData,
  ): Promise<PtyInstance | undefined> {
    const storedPtyId = sessionData.metadata?.external?.pty?.ptyInstanceId;

    if (storedPtyId) {
      // Check if PTY instance still exists in manager
      const ptyInstance = this.ptyInstanceManager.getSession(storedPtyId);

      if (ptyInstance) {
        return ptyInstance;
      } else {
        this.logger.info(
          `Cleaning stale ptyInstanceId ${storedPtyId} from session ${sessionData.id}`,
        );

        // PTY instance no longer exists, clear stale reference
        if (sessionData.metadata?.external?.pty) {
          sessionData.metadata.external.pty.ptyInstanceId = undefined;
        }

        // Update session status if it was marked as active
        if (sessionData.sessionStatus === "external_active") {
          sessionData.sessionStatus = "external_terminated";
          sessionData.updatedAt = new Date();
        }

        // Save the cleaned data back to file
        await this.chatSessionRepository.saveToFile(
          sessionData.absoluteFilePath,
          sessionData,
        );
      }
    }

    return undefined;
  }

  async updatePtyChat(
    absoluteFilePath: string,
    updates: Partial<ChatSessionData>,
  ): Promise<void> {
    const sessionEntry = Array.from(this.sessions.values()).find(
      (entry) => entry.session.absoluteFilePath === absoluteFilePath,
    );

    if (!sessionEntry) {
      throw new Error(`PTY chat session not found: ${absoluteFilePath}`);
    }

    const session = sessionEntry.session;

    // Update metadata if provided
    if (updates.metadata) {
      session.metadata = merge(session.metadata || {}, updates.metadata);
      session.updatedAt = new Date();

      // Emit update event
      this.eventBus.emit<PtyChatUpdatedEvent>({
        kind: "PtyChatUpdatedEvent",
        timestamp: new Date(),
        sessionId: session.id,
        updateType: "METADATA_UPDATED",
        update: { metadata: session.metadata },
        session,
      });
    }

    // Update maxTurns if provided (though not used in PTY chats)
    if (updates.maxTurns !== undefined) {
      session.maxTurns = updates.maxTurns;
      session.updatedAt = new Date();
    }

    // Persist the updated session
    await this.chatSessionRepository.saveToFile(
      session.absoluteFilePath,
      session.toJSON(),
    );
  }

  private async handlePtyChatSessionUpdate(
    session: PtyChatSession,
    updateType: PtyChatUpdateType,
    update: PtyChatUpdate,
  ): Promise<void> {
    const payload = session.toJSON();

    // console.debug("handlePtyChatSessionUpdate", {
    //   session,
    //   updateType,
    //   update,
    // });

    // await this.chatSessionRepository.saveToFile(
    //   session.absoluteFilePath,
    //   payload,
    // );

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
