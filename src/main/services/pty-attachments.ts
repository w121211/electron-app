// src/main/services/pty-attachments.ts
import type { WebContents } from "electron";
import type { PtyInstanceManager } from "../../core/services/pty/pty-instance-manager.js";

interface AttachmentCleanup {
  offData: () => void;
  offExit: () => void;
}

type AttachmentRegistry = Map<string, Map<number, AttachmentCleanup>>;

export interface PtyAttachmentService {
  attach(sessionId: string, sender: WebContents): boolean;
}

export function createPtyAttachmentService(
  ptyInstanceManager: PtyInstanceManager,
): PtyAttachmentService {
  const attachments: AttachmentRegistry = new Map();

  const detach = (sessionId: string, senderId: number): void => {
    const perSender = attachments.get(sessionId);
    const cleanup = perSender?.get(senderId);
    if (!cleanup) {
      return;
    }
    cleanup.offData();
    cleanup.offExit();
    perSender?.delete(senderId);
  };

  const attach = (sessionId: string, sender: WebContents): boolean => {
    const instance = ptyInstanceManager.getSession(sessionId);
    if (!instance) {
      console.error(`PTY session not found for ID: ${sessionId}`);
      return false;
    }

    const senderId = sender.id;
    let perSender = attachments.get(sessionId);
    if (!perSender) {
      perSender = new Map();
      attachments.set(sessionId, perSender);
    }

    const existing = perSender.get(senderId);
    if (existing) {
      existing.offData();
      existing.offExit();
    }

    const offData = instance.onData((data) => {
      if (!sender.isDestroyed()) {
        sender.send("pty:data", instance.id, data);
      }
    });

    const offExit = instance.onExit(({ exitCode, signal }) => {
      if (!sender.isDestroyed()) {
        sender.send("pty:exit", instance.id, exitCode, signal);
      }
    });

    perSender.set(senderId, { offData, offExit });

    const cleanup = () => {
      detach(sessionId, senderId);
    };

    sender.once("destroyed", cleanup);
    sender.on("render-process-gone", cleanup);
    sender.on("did-start-navigation", cleanup);

    return true;
  };

  return {
    attach,
  };
}
