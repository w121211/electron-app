// src/renderer/src/services/pty-client.ts
import { Logger } from "tslog";

// A simple generic event emitter
type Listener<T> = (data: T) => void;
class EventEmitter<T> {
  private listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.off(listener);
  }

  off(listener: Listener<T>): void {
    this.listeners.delete(listener);
  }

  emit(data: T): void {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export interface PtyCreateOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class PtySession {
  public readonly onData = new EventEmitter<string>();
  public readonly onExit = new EventEmitter<{
    exitCode: number;
    signal?: number;
  }>();

  constructor(public readonly sessionId: string) {}

  write(data: string): Promise<boolean> {
    return window.api.pty.write(this.sessionId, data);
  }

  resize(cols: number, rows: number): Promise<boolean> {
    return window.api.pty.resize(this.sessionId, { cols, rows });
  }

  destroy(): Promise<boolean> {
    return window.api.pty.destroy(this.sessionId);
  }

  dispose(): void {
    this.onData.dispose();
    this.onExit.dispose();
  }
}

class PtyClient {
  private logger = new Logger({ name: "PtyClient" });
  private sessions = new Map<string, PtySession>();

  constructor() {
    this.logger.info("PtyClient initialized");
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    window.api.pty.onData((sessionId: string, data: string) => {
      this.sessions.get(sessionId)?.onData.emit(data);
    });

    window.api.pty.onExit(
      (sessionId: string, exitCode: number, signal?: number) => {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.onExit.emit({ exitCode, signal });
          session.dispose();
          this.sessions.delete(sessionId);
          this.logger.info(`Terminal session ${sessionId} ended`, {
            exitCode,
            signal,
          });
        }
      },
    );
  }

  async createSession(options: PtyCreateOptions = {}): Promise<PtySession> {
    const sessionId = await window.api.pty.create(options);
    if (!sessionId) {
      throw new Error("Failed to create terminal session");
    }

    const session = new PtySession(sessionId);
    this.sessions.set(sessionId, session);
    this.logger.info(`Terminal session created: ${sessionId}`, options);

    return session;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }

  async destroyAllSessions(): Promise<void> {
    const destroyPromises = Array.from(this.sessions.values()).map((session) =>
      session.destroy(),
    );
    await Promise.all(destroyPromises);
    this.logger.info("All terminal sessions destroyed");
  }

  dispose(): void {
    window.api.pty.removeAllListeners();
    this.sessions.forEach((session) => session.dispose());
    this.sessions.clear();
    this.logger.info("PtyClient disposed");
  }
}

export const ptyClient = new PtyClient();
