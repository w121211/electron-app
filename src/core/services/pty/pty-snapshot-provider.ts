// src/core/services/pty/pty-snapshot-provider.ts
import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import type {
  SnapshotProvider,
  SnapshotTriggerKind,
} from "./pty-chat-client.js";

export interface SnapshotRequestPayload {
  requestId: string;
  sessionId: string;
  ptyInstanceId: string;
  trigger: SnapshotTriggerKind;
}

export interface SnapshotResponsePayload {
  requestId: string;
  snapshot?: string | null;
}

const pendingSnapshotRequests = new Map<
  string,
  { resolve: (value: string | null) => void; timer: NodeJS.Timeout }
>();

export const requestRendererSnapshot: SnapshotProvider = async ({
  session,
  event,
}) => {
  const ptyInstanceId = session.ptyInstanceId;
  if (!ptyInstanceId) {
    return null;
  }

  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    return null;
  }

  const requestId = randomUUID();

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      pendingSnapshotRequests.delete(requestId);
      resolve(null);
    }, 250);

    pendingSnapshotRequests.set(requestId, { resolve, timer });

    const payload: SnapshotRequestPayload = {
      requestId,
      sessionId: session.id,
      ptyInstanceId,
      trigger: event.kind,
    };

    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send("pty:snapshot-request", payload);
      }
    }
  });
};

export function handleSnapshotResponse(payload: SnapshotResponsePayload): void {
  const entry = pendingSnapshotRequests.get(payload.requestId);
  if (!entry) {
    return;
  }
  pendingSnapshotRequests.delete(payload.requestId);
  clearTimeout(entry.timer);
  const snapshot =
    typeof payload.snapshot === "string" ? payload.snapshot : null;
  entry.resolve(snapshot);
}
