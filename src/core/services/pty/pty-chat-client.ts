// src/core/services/pty/pty-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import { PtyInstanceManager } from "./pty-instance-manager.js";
import { PtyChatSession } from "./pty-chat-session.js";
import { PtyDataProcessor } from "./pty-data-processor.js";
import type { PtyStreamEventMap } from "./pty-data-processor.js";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import type { PtyInstance } from "./pty-instance-manager.js";
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

export class PtyChatClient {
  private readonly sessions = new Map<string, PtyChatSession>();
  private readonly sessionIdByPtyInstance = new Map<string, string>();
  private readonly processors = new Map<string, PtyDataProcessor>();
  private readonly processorSubscriptions = new Map<string, Array<() => void>>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
    private readonly ptyInstanceManager: PtyInstanceManager,
    private readonly snapshotProvider?: SnapshotProvider,
  ) {
    this.subscribeToPtyEvents();
  }

  async createSession(input: CreatePtyChatInput): Promise<ChatSessionData> {
    const timestamp = new Date();
    const sessionData: ChatSessionData = {
      id: uuidv4(),
      sessionType: "pty_chat",
      state: "active",
      messages: [],
      metadata: {
        modelId: input.modelId,
        mode: "agent",
        external: {
          mode: "pty",
          workingDirectory: input.workingDirectory,
          pty: {},
        },
        ...input.metadata,
      },
      scriptPath: null,
      scriptModifiedAt: null,
      scriptHash: null,
      scriptSnapshot: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.create(sessionData);

    const session = new PtyChatSession(sessionData, this.eventBus);
    const ptyInstance = this.ptyInstanceManager.create({
      cwd: input.workingDirectory,
    });

    session.ptyInstanceId = ptyInstance.id;
    this.sessions.set(session.id, session);
    this.sessionIdByPtyInstance.set(ptyInstance.id, session.id);

    const processor = new PtyDataProcessor(ptyInstance, {
      sessionId: session.id,
    });
    this.processors.set(ptyInstance.id, processor);
    this.attachProcessorListeners(session, processor, ptyInstance.id);

    await this.repository.update(session.toChatSessionData());

    return session.toChatSessionData();
  }

  async updateSession(
    sessionId: string,
    updates: Partial<ChatSessionData>,
  ): Promise<ChatSessionData> {
    const session = await this.ensureSessionLoaded(sessionId);
    const currentData = session.toChatSessionData();
    const updatedData = { ...currentData, ...updates, updatedAt: new Date() };
    await this.repository.update(updatedData);
    return updatedData;
  }

  async terminateSession(sessionId: string): Promise<ChatSessionData> {
    const session = await this.ensureSessionLoaded(sessionId);
    const ptyInstance = this.getPtyInstance(session);
    const ptyInstanceId = session.ptyInstanceId;

    session.markTerminated();
    session.ptyInstanceId = undefined;

    if (ptyInstance) {
      ptyInstance.kill();
    }

    if (ptyInstanceId) {
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
      this.sessionIdByPtyInstance.delete(ptyInstanceId);
    }

    const updatedSession = session.toChatSessionData();
    await this.repository.update(updatedSession);
    this.sessions.delete(sessionId);
    return updatedSession;
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

    subscriptions.push(
      processor.on("outputIdle", (event) => {
        void this.flushSnapshot(session, processor, event);
      }),
    );

    subscriptions.push(
      processor.on("screenCleared", (event) => {
        session.recordCliEvent("screenRefresh", {});
        void this.flushSnapshot(session, processor, event);
      }),
    );

    subscriptions.push(
      processor.on("sessionBanner", (event) => {
        session.recordCliEvent("newSession", {
          source: event.provider,
          raw: event.raw,
        });
        void this.flushSnapshot(session, processor, event);
      }),
    );

    this.processorSubscriptions.set(ptyInstanceId, subscriptions);
  }

  private async flushSnapshot(
    session: PtyChatSession,
    processor: PtyDataProcessor,
    event: PtyStreamEventMap[SnapshotTriggerKind],
  ): Promise<void> {
    let snapshot: string | null | undefined;
    if (this.snapshotProvider) {
      try {
        snapshot = await this.snapshotProvider({
          session,
          processor,
          event,
        });
      } catch (error) {
        console.error("Snapshot provider failed", {
          sessionId: session.id,
          error,
        });
        snapshot = null;
      }
    }

    if (!snapshot) {
      snapshot = processor.getBufferedOutput();
    }

    if (!snapshot || snapshot.trim().length === 0) {
      return;
    }

    session.updateFromSnapshot(snapshot);
  }

  private subscribeToPtyEvents(): void {
    this.eventBus.subscribe("PtyOnExit", async (event: PtyOnExitEvent) => {
      const session = await this.getSessionByPtyInstance(event.sessionId);
      if (!session) {
        return;
      }
      session.recordPtyExit();
      await this.repository.update(session.toChatSessionData());
      this.sessionIdByPtyInstance.delete(event.sessionId);
    });
  }

  private async ensureSessionLoaded(
    sessionId: string,
  ): Promise<PtyChatSession> {
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
      this.sessionIdByPtyInstance.set(ptyId, sessionId);
    }

    return session;
  }

  private async getSessionByPtyInstance(
    ptyInstanceId: string,
  ): Promise<PtyChatSession | undefined> {
    const sessionId = this.sessionIdByPtyInstance.get(ptyInstanceId);
    if (sessionId) {
      return this.ensureSessionLoaded(sessionId);
    }

    const sessions = await this.repository.list();
    for (const data of sessions) {
      if (data.sessionType !== "pty_chat") {
        continue;
      }
      const existingPtyId = data.metadata?.external?.pty?.ptyInstanceId;
      if (existingPtyId === ptyInstanceId) {
        this.sessionIdByPtyInstance.set(ptyInstanceId, data.id);
        return this.ensureSessionLoaded(data.id);
      }
    }
    return undefined;
  }

  private getPtyInstance(session: PtyChatSession): PtyInstance | undefined {
    const instanceId = session.ptyInstanceId;
    if (!instanceId) {
      return undefined;
    }
    return this.ptyInstanceManager.getSession(instanceId);
  }
}
