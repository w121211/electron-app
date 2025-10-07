// src/renderer/src/services/pty-client.ts
import { ptyStreamManager, PtyStream } from "./pty-stream-manager.js";

interface CreatePtyStreamOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
}

class PtyClient {
  async createPtyStream(
    options: CreatePtyStreamOptions = {},
  ): Promise<PtyStream> {
    // Prefer atomic create+attach to avoid missing initial output
    // @ts-ignore runtime existence check
    const sessionId: string =
      typeof window.api.pty.createAndAttach === "function"
        ? await window.api.pty.createAndAttach({
            cols: options.cols,
            rows: options.rows,
            cwd: options.cwd,
            shell: options.shell,
          })
        : await window.api.pty.create({
            cols: options.cols,
            rows: options.rows,
            cwd: options.cwd,
            shell: options.shell,
          });
    return ptyStreamManager.getOrAttachStream(sessionId);
  }
}

export const ptyClient = new PtyClient();
