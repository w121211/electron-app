// src/core/services/pty/pty-chat-client.ts
import { v4 as uuidv4 } from "uuid";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import type { PtyInstance } from "./pty-instance-manager.js";
import { PtyInstanceManager } from "./pty-instance-manager.js";
import type {
  PtyOnDataEvent,
  PtyOnExitEvent,
  PtyWriteEvent,
} from "./events.js";
import { PtyChatSession } from "./pty-chat-session.js";

interface CreatePtyChatInput {
  workingDirectory: string;
  modelId: `${string}/${string}`;
  initialPrompt?: string;
  metadata?: Partial<ChatMetadata>;
}

export class PtyChatClient {
  private readonly sessions = new Map<string, PtyChatSession>();
  private readonly sessionIdByPtyInstance = new Map<string, string>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
    private readonly ptyInstanceManager: PtyInstanceManager,
  ) {
    this.subscribeToPtyEvents();
  }

  async createSession(input: CreatePtyChatInput): Promise<ChatSessionData> {
    const timestamp = new Date();
    const sessionData: ChatSessionData = {
      id: uuidv4(),
      sessionType: "pty_chat",
      sessionStatus: "external_active",
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
    await this.repository.update(session.toChatSessionData());

    // if (input.initialPrompt) {
    //   this.writeToInstance(
    //     ptyInstance,
    //     input.initialPrompt.endsWith("\n")
    //       ? input.initialPrompt
    //       : `${input.initialPrompt}\n`,
    //   );
    // }

    return session.toChatSessionData();
  }

  // async sendInput(sessionId: string, data: string): Promise<void> {
  //   const session = await this.ensureSessionLoaded(sessionId);
  //   const ptyInstance = this.getPtyInstance(session);
  //   if (!ptyInstance) {
  //     throw new Error(`PTY instance missing for session ${sessionId}`);
  //   }
  //   const text = data.endsWith("\n") ? data : `${data}\n`;
  //   this.writeToInstance(ptyInstance, text);
  // }

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

  async terminateChatSession(sessionId: string): Promise<ChatSessionData> {
    const session = await this.ensureSessionLoaded(sessionId);
    const ptyInstance = this.getPtyInstance(session);
    const ptyInstanceId = session.ptyInstanceId;

    session.markTerminated();
    session.ptyInstanceId = undefined;

    if (ptyInstance) {
      ptyInstance.kill();
    }

    if (ptyInstanceId) {
      this.sessionIdByPtyInstance.delete(ptyInstanceId);
    }

    const updatedSession = session.toChatSessionData();
    await this.repository.update(updatedSession);
    this.sessions.delete(sessionId);
    return updatedSession;
  }

  private subscribeToPtyEvents(): void {
    this.eventBus.subscribe("PtyWrite", async (event: PtyWriteEvent) => {
      const session = await this.getSessionByPtyInstance(event.sessionId);
      if (!session) {
        return;
      }
      session.recordUserInput(event.data);
      await this.repository.update(session.toChatSessionData());
    });

    this.eventBus.subscribe("PtyOnData", async (event: PtyOnDataEvent) => {
      const session = await this.getSessionByPtyInstance(event.sessionId);
      if (!session) {
        return;
      }
      session.recordAssistantOutput(event.data);
      await this.repository.update(session.toChatSessionData());
    });

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
