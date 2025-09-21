// src/core/services/pty/events.ts
import type { BaseEvent } from "../../event-bus.js";
import type { PtyChatSession } from "./pty-chat-session.js";
import type { PtyChatUpdateType, PtyChatUpdate } from "./pty-chat-session.js";

// PTY events
export interface PtyOnDataEvent extends BaseEvent {
  kind: "PtyOnData";
  sessionId: string;
  data: string;
}

export interface PtyWriteEvent extends BaseEvent {
  kind: "PtyWrite";
  sessionId: string;
  data: string;
}

export interface PtyResizeEvent extends BaseEvent {
  kind: "PtyResize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyOnExitEvent extends BaseEvent {
  kind: "PtyOnExit";
  sessionId: string;
  exitCode: number;
  signal?: number;
}

// PTY chat session events
export interface PtyChatUpdatedEvent extends BaseEvent {
  kind: "PtyChatUpdatedEvent";
  sessionId: string;
  updateType: PtyChatUpdateType;
  update: PtyChatUpdate;
  session: PtyChatSession;
}
