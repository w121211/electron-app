// src/core/services/chat/pty-chat/events.ts
import type { BaseEvent } from "../../../event-bus.js";
import type { PtyChatSession } from "./pty-chat-session.js";
import type { PtyChatUpdateType, PtyChatUpdate } from "./pty-chat-session.js";

export interface PtyChatUpdatedEvent extends BaseEvent {
  kind: "PtyChatUpdatedEvent";
  sessionId: string;
  updateType: PtyChatUpdateType;
  update: PtyChatUpdate;
  session: PtyChatSession;
}
