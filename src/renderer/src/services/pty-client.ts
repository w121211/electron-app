// src/renderer/src/services/pty-client.ts
import { Logger } from "tslog";

export interface PtyCreateOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PtyClientSession {
  sessionId: string;
  isActive: boolean;
  onData?: (data: string) => void;
  onExit?: (exitCode: number, signal?: number) => void;
}

export class PtyClient {
  private logger = new Logger({ name: "PtyClient" });
  private sessions = new Map<string, PtyClientSession>();

  constructor() {
    this.logger.info("PtyClient initialized");
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    window.api.pty.onData((sessionId: string, data: string) => {
      const session = this.sessions.get(sessionId);
      session?.onData?.(data);
    });

    window.api.pty.onExit(
      (sessionId: string, exitCode: number, signal?: number) => {
        const session = this.sessions.get(sessionId);
        session?.onExit?.(exitCode, signal);

        this.sessions.delete(sessionId);

        this.logger.info(`Terminal session ${sessionId} ended`, {
          exitCode,
          signal,
        });
      },
    );
  }

  private cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  async createSession(
    options: PtyCreateOptions = {},
  ): Promise<string | null> {
    try {
      const sessionId = await window.api.pty.create(options);
      if (!sessionId) {
        this.logger.error("Failed to create terminal session");
        return null;
      }

      const session: PtyClientSession = {
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
      this.cleanupSession(sessionId);
      this.logger.info(`Terminal session destroyed: ${sessionId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error destroying session ${sessionId}:`, error);
      return false;
    }
  }

  onSessionData(sessionId: string, callback: (data: string) => void): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.onData = callback;
    }
  }

  onSessionExit(
    sessionId: string,
    callback: (exitCode: number, signal?: number) => void,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.onExit = callback;
    }
  }

  getSession(sessionId: string): PtyClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtyClientSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): PtyClientSession[] {
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
    window.api.pty.removeAllListeners();
    this.sessions.clear();
    this.logger.info("PtyClient disposed");
  }
}