// src/core/pty/events.ts
import type { BaseEvent } from "../event-bus.js";

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
