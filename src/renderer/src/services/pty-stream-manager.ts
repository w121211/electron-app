// src/renderer/src/services/pty-stream-manager.ts
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

export class PtyStream {
  public readonly onData = new EventEmitter<string>();
  public readonly onExit = new EventEmitter<{
    exitCode: number;
    signal?: number;
  }>();
  public readonly onPressEnter = new EventEmitter<string>();

  public isCursorVisible: boolean = true;
  private terminalSnapshot: string = "";
  private lastActivity: Date | null = null;

  constructor(public readonly sessionId: string) {}

  public processStateFromData(data: string): void {
    // Check for cursor visibility commands
    if (data.includes("\x1b[?25l")) {
      this.isCursorVisible = false;
    }
    if (data.includes("\x1b[?25h")) {
      this.isCursorVisible = true;
    }
  }

  write(data: string): Promise<boolean> {
    if (data === '\r') {
      this.onPressEnter.emit(data);
    }
    return window.api.pty.write(this.sessionId, data);
  }

  resize(cols: number, rows: number): Promise<boolean> {
    return window.api.pty.resize(this.sessionId, { cols, rows });
  }

  destroy(): Promise<boolean> {
    return window.api.pty.destroy(this.sessionId);
  }

  saveTerminalSnapshot(serializedContent: string): void {
    this.terminalSnapshot = serializedContent;
    this.lastActivity = new Date();
  }

  getTerminalSnapshot(): string {
    return this.terminalSnapshot;
  }

  getLastActivity(): Date | null {
    return this.lastActivity;
  }

  dispose(): void {
    this.onData.dispose();
    this.onExit.dispose();
    this.onPressEnter.dispose();
  }
}

class PtyStreamManager {
  private logger = new Logger({ name: "PtyStreamManager" });
  private streams = new Map<string, PtyStream>();
  private unsubscribeOnData: (() => void) | undefined;
  private unsubscribeOnExit: (() => void) | undefined;

  constructor() {
    this.logger.info("PtyStreamManager initialized");
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    this.unsubscribeOnData = window.api.pty.onData(
      (sessionId: string, data: string) => {
        const stream = this.streams.get(sessionId);
        if (stream) {
          // Step 1: Update the stream's internal state
          stream.processStateFromData(data);

          // Step 2: Explicitly pass the data to UI listeners
          stream.onData.emit(data);
        }
      },
    );

    this.unsubscribeOnExit = window.api.pty.onExit(
      (sessionId: string, exitCode: number, signal?: number) => {
        const stream = this.streams.get(sessionId);
        if (stream) {
          stream.onExit.emit({ exitCode, signal });
          stream.dispose();
          this.streams.delete(sessionId);
          this.logger.info(`Terminal session ${sessionId} ended`, {
            exitCode,
            signal,
          });
        }
      },
    );
  }

  getOrAttachStream(sessionId: string): PtyStream {
    let stream = this.streams.get(sessionId);
    if (!stream) {
      stream = new PtyStream(sessionId);
      this.streams.set(sessionId, stream);
      window.api.pty.attach(sessionId);
      this.logger.info(`PTY session created and attached: ${sessionId}`);
    }
    return stream;
  }

  getStream(sessionId: string): PtyStream | undefined {
    return this.streams.get(sessionId);
  }

  getAllStreams(): PtyStream[] {
    return Array.from(this.streams.values());
  }

  async destroyAllStreams(): Promise<void> {
    const destroyPromises = Array.from(this.streams.values()).map((stream) =>
      stream.destroy(),
    );
    await Promise.all(destroyPromises);
    this.logger.info("All terminal sessions destroyed");
  }

  dispose(): void {
    this.unsubscribeOnData?.();
    this.unsubscribeOnExit?.();
    this.streams.forEach((stream) => stream.dispose());
    this.streams.clear();
    this.logger.info("PtyStreamManager disposed");
  }
}

export const ptyStreamManager = new PtyStreamManager();