// src/core/services/pty/pty-session-manager.ts
import * as pty from "node-pty";
import { Logger } from "tslog";
import type { IEventBus } from "../../event-bus.js";

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
  private onDataListeners = new Set<(data: string) => void>();
  private onExitListeners = new Set<
    (e: { exitCode: number; signal?: number }) => void
  >();

  constructor(
    options: PtyCreateOptions = {},
    private readonly eventBus: IEventBus,
  ) {
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

    this.ptyProcess.onData((data) => {
      this.onDataListeners.forEach((listener) => listener(data));
      this.eventBus?.emit({
        kind: "PtyOnData",
        sessionId: this.id,
        data,
        timestamp: new Date(),
      });
    });

    this.ptyProcess.onExit((e) => {
      this.onExitListeners.forEach((listener) => listener(e));
      this.eventBus?.emit({
        kind: "PtyOnExit",
        sessionId: this.id,
        exitCode: e.exitCode,
        signal: e.signal,
        timestamp: new Date(),
      });
    });

    PtyInstance.logger.info(`Pty instance ${this.id} created successfully`);
  }

  write(data: string): void {
    this.ptyProcess.write(data);
    this.eventBus?.emit({
      kind: "PtyWrite",
      sessionId: this.id,
      data,
      timestamp: new Date(),
    });
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    this.eventBus?.emit({
      kind: "PtyResize",
      sessionId: this.id,
      cols,
      rows,
      timestamp: new Date(),
    });
    PtyInstance.logger.debug(
      `Pty instance ${this.id} resized to ${cols}x${rows}`,
    );
  }

  kill(): void {
    PtyInstance.logger.info(`Killing pty instance ${this.id}`);
    this.ptyProcess.kill();
  }

  onData(listener: (data: string) => void): () => void {
    this.onDataListeners.add(listener);
    return () => this.onDataListeners.delete(listener);
  }

  onExit(
    listener: (e: { exitCode: number; signal?: number }) => void,
  ): () => void {
    this.onExitListeners.add(listener);
    return () => this.onExitListeners.delete(listener);
  }
}

/**
 * Manages the lifecycle of all PtyInstance objects.
 * It creates, tracks, and destroys pty sessions for the application.
 */
export class PtySessionManager {
  private logger = new Logger({ name: "PtySessionManager" });
  private sessions = new Map<string, PtyInstance>();

  constructor(private eventBus: IEventBus) {
    this.logger.info("PtySessionManager initialized with event bus");
  }

  create(options: PtyCreateOptions = {}): PtyInstance {
    const session = new PtyInstance(options, this.eventBus);
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
    this.sessions.clear();
  }
}

export function createPtySessionManager(
  eventBus: IEventBus,
): PtySessionManager {
  return new PtySessionManager(eventBus);
}
