// src/core/services/pty-session-manager.ts
import * as pty from "node-pty";
import { EventEmitter } from "events";
import { Logger } from "tslog";

export interface PtySession {
  id: string;
  pty: pty.IPty;
  shell: string;
  cwd: string;
}

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

export class PtySessionManager extends EventEmitter {
  private logger = new Logger({ name: "PtySessionManager" });
  private sessions = new Map<string, PtySession>();
  private sessionIdCounter = 0;

  constructor() {
    super();
    this.logger.info("PtySessionManager initialized");
  }

  create(options: PtyCreateOptions = {}): string {
    const sessionId = `pty-${++this.sessionIdCounter}`;
    const isWindows = process.platform === "win32";
    const shell =
      options.shell ||
      (isWindows ? "powershell.exe" : process.env.SHELL || "/bin/bash");
    const cwd = options.cwd || process.cwd();

    this.logger.info(`Creating pty session ${sessionId}`, { shell, cwd });

    const env = {
      ...process.env,
      ...options.env,
      COLORTERM: "truecolor",
      TERM_PROGRAM: "xterm",
      TERM_PROGRAM_VERSION: "1.0.0",
    };

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: options.cols || 80,
      rows: options.rows || 48,
      cwd,
      env,
      encoding: "utf8", // Force UTF8 to prevent ANSI code corruption
      useConpty: isWindows,
      // handleFlowControl: false,
    });

    const session: PtySession = {
      id: sessionId,
      pty: ptyProcess,
      shell,
      cwd,
    };

    this.sessions.set(sessionId, session);

    // Forward pty data to the renderer
    ptyProcess.onData((data) => {
      this.logger.debug(`Pty session ${sessionId} data:`, data);
      this.emit("data", sessionId, data);
    });

    // Handle pty exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.logger.info(`Pty session ${sessionId} exited`, { exitCode, signal });
      this.sessions.delete(sessionId);
      this.emit("exit", sessionId, exitCode, signal);
    });

    this.logger.info(`Pty session ${sessionId} created successfully`);
    return sessionId;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `Attempted to write to non-existent pty session: ${sessionId}`,
      );
      return false;
    }

    session.pty.write(data);
    return true;
  }

  resize(sessionId: string, options: PtyResizeOptions): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `Attempted to resize non-existent pty session: ${sessionId}`,
      );
      return false;
    }

    session.pty.resize(options.cols, options.rows);
    this.logger.debug(
      `Pty session ${sessionId} resized to ${options.cols}x${options.rows}`,
    );
    return true;
  }

  destroy(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `Attempted to destroy non-existent pty session: ${sessionId}`,
      );
      return false;
    }

    session.pty.kill();
    this.sessions.delete(sessionId);
    this.logger.info(`Pty session ${sessionId} destroyed`);
    return true;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }

  destroyAll(): void {
    for (const [sessionId, session] of this.sessions) {
      session.pty.kill();
      this.logger.info(`Destroyed pty session ${sessionId}`);
    }
    this.sessions.clear();
    this.logger.info("All pty sessions destroyed");
  }
}