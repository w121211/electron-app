// src/core/services/external-chat/terminal-chat-client.ts
import { v4 as uuidv4 } from 'uuid';
import type { IEventBus } from '../../event-bus.js';
import type {
  ChatSessionData,
  ChatSessionRepository,
} from '../chat/chat-session-repository.js';
import {
  type IExternalChatClient,
  type CreateExternalSessionInput,
} from './external-chat-client.interface.js';
import { TerminalChatSession } from './terminal-chat-session.js';
import { getModelSurface } from '../../utils/model-utils.js';

export class TerminalChatClient implements IExternalChatClient {
  private readonly sessions = new Map<string, TerminalChatSession>();

  constructor(
    private readonly eventBus: IEventBus,
    private readonly repository: ChatSessionRepository,
  ) {}

  async createSession(
    input: CreateExternalSessionInput,
  ): Promise<ChatSessionData> {
    const timestamp = new Date();
    const modelSurface = getModelSurface(input.modelId);
    const metadata = {
      ...input.metadata,
      title: input.title ?? input.metadata?.title ?? 'Terminal Session',
      modelId: input.modelId,
      modelSurface,
      mode: 'agent' as const,
      external: {
        ...input.metadata?.external,
        workingDirectory: input.workingDirectory,
      },
    };

    const sessionData: ChatSessionData = {
      id: uuidv4(),
      modelSurface,
      state: 'active',
      messages: [],
      metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
      scriptPath: input.script?.path ?? null,
      scriptHash: input.script?.hash ?? null,
      scriptSnapshot: input.script?.snapshot ?? null,
      scriptModifiedAt: input.script?.modifiedAt ?? null,
    };

    if (!input.workingDirectory) {
      throw new Error('Working directory is required for a terminal session.');
    }

    await this.repository.create(sessionData);
    const session = new TerminalChatSession(sessionData, this.eventBus);
    this.sessions.set(session.id, session);

    return session.toJSON();
  }

  async terminateSession(sessionId: string): Promise<ChatSessionData> {
    const session = await this.getOrLoadSession(sessionId);

    session.terminate();

    const updatedData = session.toJSON();
    await this.repository.update(updatedData);
    this.sessions.delete(sessionId);

    return updatedData;
  }

  private async getOrLoadSession(sessionId: string): Promise<TerminalChatSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const data = await this.repository.getById(sessionId);
    if (!data) {
      throw new Error(`Terminal session ${sessionId} not found`);
    }
    const session = new TerminalChatSession(data, this.eventBus);
    this.sessions.set(sessionId, session);
    return session;
  }
}
