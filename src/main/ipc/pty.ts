// src/main/ipc/pty.ts
import { ipcMain } from "electron";
import {
  requestRendererSnapshot,
  handleSnapshotResponse,
  type SnapshotResponsePayload,
} from "../../core/services/pty/pty-snapshot-provider.js";
import type { SnapshotProviderContext } from "../../core/services/pty/pty-chat-client.js";
import type { MainProcessContext } from "../context.js";
import type { PtyAttachmentService } from "../services/pty-attachments.js";

export function registerPtyIpcHandlers(
  context: MainProcessContext,
  attachments: PtyAttachmentService,
): void {
  ipcMain.on(
    "pty:snapshot-response",
    (_event, payload: SnapshotResponsePayload) => {
      handleSnapshotResponse(payload);
    },
  );

  if (process.env.PTY_EXPOSE_SNAPSHOT_PROVIDER === "1") {
    ipcMain.handle(
      "test:pty:request-renderer-snapshot",
      async (_event, snapshotContext: SnapshotProviderContext) => {
        return requestRendererSnapshot(snapshotContext);
      },
    );
  }

  ipcMain.handle(
    "pty:create",
    async (
      _,
      options: { cols?: number; rows?: number; cwd?: string; shell?: string },
    ) => {
      const instance = context.ptyInstanceManager.create({
        cols: options?.cols,
        rows: options?.rows,
        cwd: options?.cwd,
        shell: options?.shell,
      });
      return instance.id;
    },
  );

  ipcMain.handle(
    "pty:createAndAttach",
    async (
      event,
      options: { cols?: number; rows?: number; cwd?: string; shell?: string },
    ) => {
      const instance = context.ptyInstanceManager.create({
        cols: options?.cols,
        rows: options?.rows,
        cwd: options?.cwd,
        shell: options?.shell,
      });
      attachments.attach(instance.id, event.sender);
      return instance.id;
    },
  );

  ipcMain.handle("pty:attach", (event, sessionId: string) => {
    return attachments.attach(sessionId, event.sender);
  });

  ipcMain.handle("pty:write", async (_, sessionId: string, data: string) => {
    const session = context.ptyInstanceManager.getSession(sessionId);
    if (session) {
      session.write(data);
      return true;
    }
    return false;
  });

  ipcMain.handle(
    "pty:resize",
    async (_, sessionId: string, options: { cols: number; rows: number }) => {
      const session = context.ptyInstanceManager.getSession(sessionId);
      if (session) {
        session.resize(options.cols, options.rows);
        return true;
      }
      return false;
    },
  );

  ipcMain.handle("pty:destroy", async (_, sessionId: string) => {
    const session = context.ptyInstanceManager.getSession(sessionId);
    if (session) {
      session.kill();
      return true;
    }
    return false;
  });
}
