// src/core/services/external-chat/external-chat-session.ts
import type { IEventBus } from '../../event-bus.js';
import type {
  ChatSessionData,
  ChatState,
} from '../chat/chat-session-repository.js';

export class ExternalChatSession {
  readonly id: string;
  protected state: ChatState;
  protected readonly eventBus: IEventBus;

  constructor(protected data: ChatSessionData, eventBus: IEventBus) {
    this.id = data.id;
    this.state = data.state;
    this.eventBus = eventBus;
  }

  public toJSON(): ChatSessionData {
    return {
      ...this.data,
      state: this.state,
      updatedAt: new Date(),
    };
  }

  public terminate(): void {
    this.state = 'terminated';
  }
}
