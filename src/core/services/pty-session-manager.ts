// src/core/services/pty-session-manager.ts
import * as pty from "node-pty";
import { Logger } from "tslog";

export interface PtyCreateOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PtyResizeOptions {
  cols: number;
  rows: number;
}

let ptySessionCounter = 0;

/**
 * A wrapper class for a single node-pty process.
 * It encapsulates the pty process and its lifecycle, providing a clean API
 * for interaction and event handling.
 */
export class PtyInstance {
  private static logger = new Logger({ name: "PtyInstance" });
  public readonly id: string;
  public readonly shell: string;
  public readonly cwd: string;
  private ptyProcess: pty.IPty;

  constructor(options: PtyCreateOptions = {}) {
    this.id = `pty-${++ptySessionCounter}`;
    const isWindows = process.platform === "win32";
    this.shell =
      options.shell ||
      (isWindows ? "powershell.exe" : process.env.SHELL || "/bin/bash");
    this.cwd = options.cwd || process.cwd();

    PtyInstance.logger.info(`Creating pty instance ${this.id}`, {
      shell: this.shell,
      cwd: this.cwd,
    });

    const env = {
      ...process.env,
      ...options.env,
      COLORTERM: "truecolor",
      TERM_PROGRAM: "xterm",
      TERM_PROGRAM_VERSION: "1.0.0",
    };

    this.ptyProcess = pty.spawn(this.shell, [], {
      name: "xterm-256color",
      cols: options.cols || 80,
      rows: options.rows || 48,
      cwd: this.cwd,
      env,
      encoding: "utf8",
      useConpty: isWindows,
    });

    PtyInstance.logger.info(`Pty instance ${this.id} created successfully`);
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    PtyInstance.logger.debug(
      `Pty instance ${this.id} resized to ${cols}x${rows}`,
    );
  }

  kill(): void {
    PtyInstance.logger.info(`Killing pty instance ${this.id}`);
    this.ptyProcess.kill();
  }

  onData(listener: (data: string) => void): void {
    this.ptyProcess.onData((data) => {
      // PtyInstance.logger.debug(`Pty instance ${this.id} data:`, data.length);
      listener(data);
    });
  }

  onExit(listener: (e: { exitCode: number; signal?: number }) => void): void {
    this.ptyProcess.onExit(listener);
  }
}

/**
 * Manages the lifecycle of all PtyInstance objects.
 * It creates, tracks, and destroys pty sessions for the application.
 */
class PtySessionManager {
  private logger = new Logger({ name: "PtySessionManager" });
  private sessions = new Map<string, PtyInstance>();

  constructor() {
    this.logger.info("PtySessionManager initialized");
  }

  create(options: PtyCreateOptions = {}): PtyInstance {
    const session = new PtyInstance(options);
    this.sessions.set(session.id, session);
    this.logger.info(`Tracking new pty session: ${session.id}`);

    // When the instance exits, stop tracking it.
    session.onExit(({ exitCode, signal }) => {
      this.sessions.delete(session.id);
      this.logger.info(
        `Pty session ${session.id} exited and is no longer tracked`,
        { exitCode, signal },
      );
    });

    return session;
  }

  getSession(sessionId: string): PtyInstance | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtyInstance[] {
    return Array.from(this.sessions.values());
  }

  destroyAll(): void {
    this.logger.info(`Destroying all ${this.sessions.size} pty sessions.`);
    for (const session of this.sessions.values()) {
      session.kill();
    }
    // The onExit handler will clear the sessions map as they terminate.
    // For immediate cleanup, we can also clear the map here.
    this.sessions.clear();
  }
}

export const ptySessionManager = new PtySessionManager();
