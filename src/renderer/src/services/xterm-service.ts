// src/renderer/src/services/xterm-service.ts
import { Logger } from "tslog";

export interface XtermCreateOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface XtermSession {
  sessionId: string;
  isActive: boolean;
}

export class XtermService {
  private logger = new Logger({ name: "XtermService" });
  private sessions = new Map<string, XtermSession>();
  private dataCallbacks = new Map<string, (data: string) => void>();
  private exitCallbacks = new Map<
    string,
    (exitCode: number, signal?: number) => void
  >();

  constructor() {
    this.logger.info("XtermService initialized");
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    // Setup global listeners for pty data and exit events
    window.api.pty.onData((sessionId: string, data: string) => {
      const callback = this.dataCallbacks.get(sessionId);
      if (callback) {
        callback(data);
      }
    });

    window.api.pty.onExit(
      (sessionId: string, exitCode: number, signal?: number) => {
        const callback = this.exitCallbacks.get(sessionId);
        if (callback) {
          callback(exitCode, signal);
        }

        // Clean up session
        this.sessions.delete(sessionId);
        this.dataCallbacks.delete(sessionId);
        this.exitCallbacks.delete(sessionId);

        this.logger.info(`Terminal session ${sessionId} ended`, {
          exitCode,
          signal,
        });
      },
    );
  }

  async createSession(
    options: XtermCreateOptions = {},
  ): Promise<string | null> {
    try {
      const sessionId = await window.api.pty.create(options);
      if (!sessionId) {
        this.logger.error("Failed to create terminal session");
        return null;
      }

      const session: XtermSession = {
        sessionId,
        isActive: true,
      };

      this.sessions.set(sessionId, session);
      this.logger.info(`Terminal session created: ${sessionId}`, options);

      return sessionId;
    } catch (error) {
      this.logger.error("Error creating terminal session:", error);
      return null;
    }
  }

  async writeToSession(sessionId: string, data: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      this.logger.warn(`Attempted to write to inactive session: ${sessionId}`);
      return false;
    }

    try {
      return await window.api.pty.write(sessionId, data);
    } catch (error) {
      this.logger.error(`Error writing to session ${sessionId}:`, error);
      return false;
    }
  }

  async resizeSession(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      this.logger.warn(`Attempted to resize inactive session: ${sessionId}`);
      return false;
    }

    try {
      return await window.api.pty.resize(sessionId, { cols, rows });
    } catch (error) {
      this.logger.error(`Error resizing session ${sessionId}:`, error);
      return false;
    }
  }

  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `Attempted to destroy non-existent session: ${sessionId}`,
      );
      return false;
    }

    try {
      const result = await window.api.pty.destroy(sessionId);

      // Clean up local state
      session.isActive = false;
      this.sessions.delete(sessionId);
      this.dataCallbacks.delete(sessionId);
      this.exitCallbacks.delete(sessionId);

      this.logger.info(`Terminal session destroyed: ${sessionId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error destroying session ${sessionId}:`, error);
      return false;
    }
  }

  onSessionData(sessionId: string, callback: (data: string) => void): void {
    this.dataCallbacks.set(sessionId, callback);
  }

  onSessionExit(
    sessionId: string,
    callback: (exitCode: number, signal?: number) => void,
  ): void {
    this.exitCallbacks.set(sessionId, callback);
  }

  getSession(sessionId: string): XtermSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): XtermSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): XtermSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.isActive,
    );
  }

  async destroyAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    const destroyPromises = sessionIds.map((sessionId) =>
      this.destroySession(sessionId),
    );

    await Promise.all(destroyPromises);
    this.logger.info("All terminal sessions destroyed");
  }

  dispose(): void {
    // Clean up listeners
    window.api.pty.removeAllListeners();

    // Clear local state
    this.sessions.clear();
    this.dataCallbacks.clear();
    this.exitCallbacks.clear();

    this.logger.info("XtermService disposed");
  }
}
