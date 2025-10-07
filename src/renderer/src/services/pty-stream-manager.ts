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
  private lastActivity: Date | null = null;
  private serializeFn?: () => string;

  constructor(public readonly ptySessionId: string) {}

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
    if (data === "\r") {
      this.onPressEnter.emit(data);
    }
    return window.api.pty.write(this.ptySessionId, data);
  }

  resize(cols: number, rows: number): Promise<boolean> {
    return window.api.pty.resize(this.ptySessionId, { cols, rows });
  }

  destroy(): Promise<boolean> {
    return window.api.pty.destroy(this.ptySessionId);
  }

  registerSerializer(fn: () => string): () => void {
    this.serializeFn = fn;

    return () => {
      this.serializeFn = undefined;
    };
  }

  getTerminalSnapshot(): string {
    if (!this.serializeFn) {
      throw new Error(
        "No terminal serializer registered. Terminal may not be mounted.",
      );
    }
    return this.serializeFn();
  }

  getLastActivity(): Date | null {
    return this.lastActivity;
  }

  dispose(): void {
    this.onData.dispose();
    this.onExit.dispose();
    this.onPressEnter.dispose();
    this.serializeFn = undefined;
  }
}

class PtyStreamManager {
  private logger = new Logger({ name: "PtyStreamManager" });
  private streams = new Map<string, PtyStream>();
  private unsubscribeOnData: (() => void) | undefined;
  private unsubscribeOnExit: (() => void) | undefined;
  private unsubscribeSnapshotRequest: (() => void) | undefined;
  public readonly onStreamsChanged = new EventEmitter<void>();

  constructor() {
    this.logger.info("PtyStreamManager initialized");
    this.setupGlobalListeners();
    this.setupSnapshotRequestListener();
  }

  private setupGlobalListeners(): void {
    this.unsubscribeOnData = window.api.pty.onData(
      (ptySessionId: string, data: string) => {
        const stream = this.streams.get(ptySessionId);
        if (stream) {
          // Step 1: Update the stream's internal state
          stream.processStateFromData(data);

          // Step 2: Explicitly pass the data to UI listeners
          if (data.includes("\x1b[?5h") || data.includes("\x1b[?5l")) {
            this.logger.info("Visible bell sequence detected in PTY stream", {
              ptySessionId,
              data,
            });
          }
          stream.onData.emit(data);
        }
      },
    );

    this.unsubscribeOnExit = window.api.pty.onExit(
      (ptySessionId: string, exitCode: number, signal?: number) => {
        const stream = this.streams.get(ptySessionId);
        if (stream) {
          stream.onExit.emit({ exitCode, signal });
          stream.dispose();
          this.streams.delete(ptySessionId);
          this.logger.info(`Terminal session ${ptySessionId} ended`, {
            exitCode,
            signal,
          });
          this.onStreamsChanged.emit();
        }
      },
    );
  }

  private setupSnapshotRequestListener(): void {
    this.unsubscribeSnapshotRequest = window.api.pty.onSnapshotRequest(
      (payload) => {
        const stream = this.streams.get(payload.ptyInstanceId);
        let snapshot: string | null = null;
        if (stream) {
          try {
            snapshot = stream.getTerminalSnapshot();
          } catch (error) {
            this.logger.warn(
              "Failed to serialize terminal snapshot",
              error,
            );
            snapshot = null;
          }
        }

        window.api.pty.sendSnapshotResponse({
          requestId: payload.requestId,
          snapshot,
        });
      },
    );
  }

  async createStream(options: {
    cols: number;
    rows: number;
    cwd?: string;
    shell?: string;
  }): Promise<PtyStream> {
    this.logger.info("Requesting new PTY stream from backend", options);
    const ptySessionId = await window.api.pty.create({
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      shell: options.shell,
    });
    this.logger.info(`PTY session created on backend: ${ptySessionId}`);
    const stream = this.getOrAttachStream(ptySessionId);
    return stream;
  }

  getOrAttachStream(ptySessionId: string): PtyStream {
    let stream = this.streams.get(ptySessionId);
    if (!stream) {
      stream = new PtyStream(ptySessionId);
      this.streams.set(ptySessionId, stream);
      const result = window.api.pty.attach(ptySessionId);
      this.logger.debug("getOrAttachStream result", { result });
      this.logger.info(
        `New PtyStream created and attached to session: ${ptySessionId}`,
      );
      this.onStreamsChanged.emit();
    }
    return stream;
  }

  getStream(ptySessionId: string): PtyStream | undefined {
    return this.streams.get(ptySessionId);
  }

  getAllStreams(): PtyStream[] {
    return Array.from(this.streams.values());
  }

  async disposeStream(ptySessionId: string): Promise<void> {
    const stream = this.streams.get(ptySessionId);
    if (stream) {
      stream.dispose();
      await stream.destroy();
      this.streams.delete(ptySessionId);
      this.logger.info(`Terminal session ${ptySessionId} disposed`);
      this.onStreamsChanged.emit();
    } else {
      this.logger.warn(`Stream ${ptySessionId} not found for disposal`);
    }
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
