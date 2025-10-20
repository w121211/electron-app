// src/core/services/pty/pty-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import { Logger } from "tslog";
import { PtyInstanceManager } from "./pty-instance-manager.js";
import { PtyChatSession } from "./pty-chat-session.js";
import { PtyDataProcessor, stripAnsi } from "./pty-data-processor.js";
import type { PtyStreamEventMap } from "./pty-data-processor.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import type { PtyOnExitEvent } from "./events.js";

interface CreatePtyChatInput {
  workingDirectory: string;
  modelId: `${string}/${string}`;
  initialPrompt?: string;
  metadata?: Partial<ChatMetadata>;
}

export type SnapshotTriggerKind =
  | "enterPressed"
  | "outputIdle"
  | "sessionBanner"
  | "screenCleared";

export interface SnapshotProviderContext {
  session: PtyChatSession;
  processor: PtyDataProcessor;
  event: PtyStreamEventMap[SnapshotTriggerKind];
}

export type SnapshotProvider = (
  context: SnapshotProviderContext,
) => Promise<string | null | undefined> | string | null | undefined;

const logger = new Logger({ name: "PtyChatClient" });

export class PtyChatClient {
  private readonly sessions = new Map<string, PtyChatSession>();
  private readonly sessionIdByPtyInstance = new Map<string, string>();
  private readonly processors = new Map<string, PtyDataProcessor>();
  private readonly processorSubscriptions = new Map<
    string,
    Array<() => void>
  >();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
    private readonly ptyInstanceManager: PtyInstanceManager,
    private readonly snapshotProvider: SnapshotProvider,
  ) {
    this.subscribeToPtyEvents();
  }

  async createSession(input: CreatePtyChatInput): Promise<ChatSessionData> {
    const timestamp = new Date();
    const metadata = {
      ...input.metadata,
      modelId: input.modelId,
      modelSurface: "pty" as const,
      mode: "agent" as const,
      external: {
        ...input.metadata?.external,
        workingDirectory: input.workingDirectory,
      },
    };

    const sessionData: ChatSessionData = {
      id: uuidv4(),
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata,
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.create(sessionData);

    const session = new PtyChatSession(sessionData, this.eventBus);
    this.sessions.set(session.id, session);

    this.attachPtyToSession(session, input.workingDirectory);

    const updatedSession = session.toChatSessionData();
    await this.repository.update(updatedSession);
    return updatedSession;
  }

  async updateSession(
    sessionId: string,
    updates: Partial<ChatSessionData>,
  ): Promise<ChatSessionData> {
    const session = await this.getOrLoadSession(sessionId);
    const currentData = session.toChatSessionData();
    const updatedData = { ...currentData, ...updates, updatedAt: new Date() };
    await this.repository.update(updatedData);
    return updatedData;
  }

  async terminateSession(sessionId: string): Promise<ChatSessionData> {
    const session = await this.getOrLoadSession(sessionId);

    session.markTerminated();
    this.detachPtyFromSession(session);

    const updatedSession = session.toChatSessionData();
    await this.repository.update(updatedSession);
    this.sessions.delete(sessionId);
    return updatedSession;
  }

  async restartTerminal(sessionId: string): Promise<ChatSessionData> {
    const session = await this.getOrLoadSession(sessionId);
    this.detachPtyFromSession(session);

    const workingDirectory = session.workingDirectory;
    if (!workingDirectory) {
      throw new Error(`No working directory found for session ${sessionId}`);
    }

    this.attachPtyToSession(session, workingDirectory);

    const updatedData = session.toChatSessionData();
    await this.repository.update(updatedData);

    logger.info(`Terminal restarted successfully for session ${sessionId}`);

    return updatedData;
  }

  private detachPtyFromSession(session: PtyChatSession): void {
    const ptyInstanceId = session.ptyInstanceId;
    if (!ptyInstanceId) {
      return;
    }
    session.ptyInstanceId = undefined;

    const processor = this.processors.get(ptyInstanceId);
    if (processor) {
      processor.destroy();
      this.processors.delete(ptyInstanceId);
    }

    const subscriptions = this.processorSubscriptions.get(ptyInstanceId);
    if (subscriptions) {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      this.processorSubscriptions.delete(ptyInstanceId);
    }

    const instance = this.ptyInstanceManager.getSession(ptyInstanceId);
    if (instance) {
      logger.info(
        `Killing PTY instance ${ptyInstanceId} for session ${session.id}`,
      );
      instance.kill();
    }

    // `PtyOnExit` event requires sessionIdByPtyInstance, so we don't delete it here.
    // this.sessionIdByPtyInstance.delete(ptyInstanceId);
  }

  private attachPtyToSession(
    session: PtyChatSession,
    workingDirectory: string,
  ): void {
    const newInstance = this.ptyInstanceManager.create({
      cwd: workingDirectory,
    });
    logger.info(
      `Created new PTY instance ${newInstance.id} for session ${session.id}`,
    );

    session.ptyInstanceId = newInstance.id;
    this.sessionIdByPtyInstance.set(newInstance.id, session.id);

    const newProcessor = new PtyDataProcessor(newInstance, {
      sessionId: session.id,
      idleTimeoutMs: 3000,
    });
    this.processors.set(newInstance.id, newProcessor);
    this.attachProcessorListeners(session, newProcessor, newInstance.id);
  }

  private attachProcessorListeners(
    session: PtyChatSession,
    processor: PtyDataProcessor,
    ptyInstanceId: string,
  ): void {
    const subscriptions: Array<() => void> = [];

    subscriptions.push(
      processor.on("enterPressed", (event) => {
        void this.flushSnapshot(session, processor, event);
      }),
    );

    // subscriptions.push(
    //   processor.on("outputIdle", (event) => {
    //     void this.flushSnapshot(session, processor, event);
    //   }),
    // );

    // subscriptions.push(
    //   processor.on("screenCleared", (event) => {
    //     session.recordCliEvent("screenRefresh", {});
    //     void this.flushSnapshot(session, processor, event);
    //   }),
    // );

    // subscriptions.push(
    //   processor.on("sessionBanner", (event) => {
    //     session.recordCliEvent("newSession", {
    //       source: event.provider,
    //       raw: event.raw,
    //     });
    //     void this.flushSnapshot(session, processor, event);
    //   }),
    // );

    this.processorSubscriptions.set(ptyInstanceId, subscriptions);
  }

  private async flushSnapshot(
    session: PtyChatSession,
    processor: PtyDataProcessor,
    event: PtyStreamEventMap[SnapshotTriggerKind],
  ): Promise<void> {
    let rawSnapshot: string | null | undefined;

    rawSnapshot = await this.snapshotProvider({
      session,
      processor,
      event,
    });

    if (!rawSnapshot) {
      rawSnapshot = processor.getBufferedOutput();
    }

    if (!rawSnapshot || rawSnapshot.trim().length === 0) {
      return;
    }

    const cleanSnapshot = stripAnsi(rawSnapshot);
    const lastSnapshot = session.toChatSessionData().scriptSnapshot;

    if (cleanSnapshot === lastSnapshot) {
      return;
    }

    processor.recordSnapshot(event.kind, cleanSnapshot);
    session.updateFromSnapshot(cleanSnapshot);
  }

  private subscribeToPtyEvents(): void {
    this.eventBus.subscribe("PtyOnExit", async (event: PtyOnExitEvent) => {
      const session = await this.getSessionByPtyInstance(event.sessionId);
      if (!session) {
        logger.debug(
          `PTY instance ${event.sessionId} exited but no associated session found, ignoring`,
        );
        return;
      }
      session.recordPtyExit();
      await this.repository.update(session.toChatSessionData());
      this.sessionIdByPtyInstance.delete(event.sessionId);
    });
  }

  private async getOrLoadSession(sessionId: string): Promise<PtyChatSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const data = await this.repository.getById(sessionId);
    if (!data) {
      throw new Error(`PTY chat session ${sessionId} not found`);
    }
    const session = new PtyChatSession(data, this.eventBus);
    this.sessions.set(sessionId, session);

    const ptyId = session.ptyInstanceId;
    if (ptyId) {
      const ptyInstance = this.ptyInstanceManager.getSession(ptyId);
      if (!ptyInstance) {
        logger.warn(
          `PTY instance ${ptyId} no longer exists for session ${sessionId}, clearing reference`,
        );
        session.ptyInstanceId = undefined;
        await this.repository.update(session.toChatSessionData());
      } else {
        this.sessionIdByPtyInstance.set(ptyId, sessionId);
      }
    }

    return session;
  }

  private async getSessionByPtyInstance(
    ptyInstanceId: string,
  ): Promise<PtyChatSession | undefined> {
    const sessionId = this.sessionIdByPtyInstance.get(ptyInstanceId);
    if (sessionId) {
      return this.getOrLoadSession(sessionId);
    }

    logger.warn(
      `PTY instance ${ptyInstanceId} not found in memory map, falling back to expensive database scan. This should not happen during normal operation.`,
    );

    const sessions = await this.repository.list();
    for (const data of sessions) {
      if (data.sessionType !== "pty_chat") {
        continue;
      }
      const existingPtyId = data.metadata?.external?.ptyInstanceId;
      if (existingPtyId === ptyInstanceId) {
        this.sessionIdByPtyInstance.set(ptyInstanceId, data.id);
        return this.getOrLoadSession(data.id);
      }
    }
    return undefined;
  }

}
