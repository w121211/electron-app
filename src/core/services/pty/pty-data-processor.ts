// src/core/services/pty/pty-data-processor.ts
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface PtyDataSource {
  readonly id: string;
  readonly shell: string;
  readonly cwd: string;
  onData(listener: (data: string) => void): () => void;
  onWrite(listener: (data: string) => void): () => void;
}

export type PtyStreamEventMap = {
  rawChunk: {
    kind: "rawChunk";
    data: string;
    timestamp: Date;
  };
  enterPressed: {
    kind: "enterPressed";
    timestamp: Date;
  };
  outputIdle: {
    kind: "outputIdle";
    idleFor: number;
    timestamp: Date;
  };
  sessionBanner: {
    kind: "sessionBanner";
    provider: "claude" | "codex" | "gemini" | "unknown";
    raw: string;
    timestamp: Date;
  };
  screenCleared: {
    kind: "screenCleared";
    raw: string;
    timestamp: Date;
  };
};

export type PtyStreamEventKind = keyof PtyStreamEventMap;

type PtyStreamEventListener<K extends PtyStreamEventKind> = (
  event: PtyStreamEventMap[K],
) => void;

type PtyStreamEventListeners = {
  [K in PtyStreamEventKind]: Set<PtyStreamEventListener<K>>;
};

interface PtyDataProcessorOptions {
  sessionId: string;
  idleTimeoutMs?: number;
}

const PTY_RECORDING_MAX_BYTES = 5 * 1024 * 1024;

function getRecordingBaseDir(): string {
  return (
    process.env.PTY_RECORDING_DIR ||
    join(process.cwd(), "tmp", "pty-recordings")
  );
}

function shouldRecordPtyStream(): boolean {
  return (
    (process.env.NODE_ENV === "development" ||
      Boolean(process.env.ELECTRON_VITE_DEV_SERVER_URL)) &&
    process.env.PTY_RECORDING_DISABLED !== "1"
  );
}

class PtyStreamRecorder {
  private stream: WriteStream | null = null;
  private bytesWritten = 0;

  private constructor(metadata: {
    sessionId: string;
    ptyInstanceId: string;
    shell: string;
    cwd: string;
  }) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dirPath = join(getRecordingBaseDir(), metadata.sessionId);
    mkdirSync(dirPath, { recursive: true });
    const filePath = join(dirPath, `${timestamp}-${metadata.ptyInstanceId}.ndjson`);
    this.stream = createWriteStream(filePath, { flags: "a" });
    this.writeEntry({ type: "meta", timestamp: new Date().toISOString(), ...metadata });
  }

  static maybeCreate(metadata: {
    sessionId: string;
    ptyInstanceId: string;
    shell: string;
    cwd: string;
  }): PtyStreamRecorder | null {
    if (!shouldRecordPtyStream()) {
      return null;
    }
    return new PtyStreamRecorder(metadata);
  }

  writeChunk(chunk: string): void {
    if (!this.stream) {
      return;
    }
    this.writeEntry({
      type: "chunk",
      timestamp: new Date().toISOString(),
      data: chunk,
    });
  }

  writeSnapshot(kind: PtyStreamEventKind, snapshot: string): void {
    if (!this.stream) {
      return;
    }

    const originalBytes = Buffer.byteLength(snapshot, "utf8");
    const compressed = gzipSync(Buffer.from(snapshot, "utf8"));
    const payload = compressed.toString("base64");

    this.writeEntry({
      type: "snapshot",
      timestamp: new Date().toISOString(),
      trigger: kind,
      encoding: "base64/gzip",
      originalBytes,
      compressedBytes: compressed.byteLength,
      payload,
    });
  }

  close(): void {
    if (!this.stream) {
      return;
    }
    this.writeEntry({
      type: "info",
      timestamp: new Date().toISOString(),
      message: "recorder:closed",
    });
    this.stream.end();
    this.stream = null;
  }

  private writeEntry(entry: Record<string, unknown>): void {
    if (!this.stream) {
      return;
    }
    const serialized = `${JSON.stringify(entry)}\n`;
    const size = Buffer.byteLength(serialized, "utf8");
    if (this.bytesWritten + size > PTY_RECORDING_MAX_BYTES) {
      this.stream.write(
        `${JSON.stringify({
          type: "warning",
          timestamp: new Date().toISOString(),
          message: "max-bytes-reached",
          bytesWritten: this.bytesWritten,
          limit: PTY_RECORDING_MAX_BYTES,
        })}\n`,
      );
      this.stream.end();
      this.stream = null;
      return;
    }
    this.stream.write(serialized);
    this.bytesWritten += size;
  }
}

function stripAnsi(payload: string): string {
  return payload.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "");
}

function detectBannerProvider(data: string): "claude" | "codex" | "gemini" | null {
  if (data.includes("Claude Code")) {
    return "claude";
  }
  if (data.includes("OpenAI Codex")) {
    return "codex";
  }
  if (data.includes("Google Gemini") || data.includes("Gemini CLI") || data.includes("\x1b[38;2;71;150;228m")) {
    return "gemini";
  }
  return null;
}

function containsClearCommand(data: string): boolean {
  const plain = stripAnsi(data);
  return />\s*\/clear\s*/.test(plain);
}

export class PtyDataProcessor {
  private readonly listeners: PtyStreamEventListeners = {
    rawChunk: new Set(),
    enterPressed: new Set(),
    outputIdle: new Set(),
    sessionBanner: new Set(),
    screenCleared: new Set(),
  };
  private readonly recorder: PtyStreamRecorder | null;
  private readonly cleanupFns: Array<() => void> = [];
  private buffer = "";
  private idleTimer: NodeJS.Timeout | null = null;
  private lastChunkTimestamp = 0;
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly source: PtyDataSource,
    options: PtyDataProcessorOptions,
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 300;
    this.recorder = PtyStreamRecorder.maybeCreate({
      sessionId: options.sessionId,
      ptyInstanceId: source.id,
      shell: source.shell,
      cwd: source.cwd,
    });

    this.cleanupFns.push(
      this.source.onData((chunk) => this.handleData(chunk)),
      this.source.onWrite((payload) => this.handleWrite(payload)),
    );
  }

  on<K extends PtyStreamEventKind>(
    kind: K,
    listener: PtyStreamEventListener<K>,
  ): () => void {
    const bucket = this.listeners[kind];
    bucket.add(listener as PtyStreamEventListener<any>);
    return () => bucket.delete(listener as PtyStreamEventListener<any>);
  }

  getBufferedOutput(): string {
    return this.buffer;
  }

  recordSnapshot(kind: PtyStreamEventKind, snapshot: string): void {
    if (!snapshot || snapshot.trim().length === 0) {
      return;
    }
    this.recorder?.writeSnapshot(kind, snapshot);
  }

  destroy(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.recorder?.close();
    while (this.cleanupFns.length > 0) {
      const dispose = this.cleanupFns.pop();
      dispose?.();
    }
    (Object.keys(this.listeners) as PtyStreamEventKind[]).forEach((kind) => {
      this.listeners[kind].clear();
    });
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    this.lastChunkTimestamp = Date.now();
    this.recorder?.writeChunk(chunk);

    this.emit("rawChunk", { kind: "rawChunk", data: chunk, timestamp: new Date() });

    const bannerProvider = detectBannerProvider(chunk);
    if (bannerProvider) {
      this.emit("sessionBanner", {
        kind: "sessionBanner",
        provider: bannerProvider,
        raw: chunk,
        timestamp: new Date(),
      });
    }

    if (containsClearCommand(chunk)) {
      this.emit("screenCleared", {
        kind: "screenCleared",
        raw: chunk,
        timestamp: new Date(),
      });
    }

    this.scheduleIdleTimer();
  }

  private handleWrite(payload: string): void {
    if (!payload.includes("\r")) {
      return;
    }
    this.lastChunkTimestamp = Date.now();
    this.emit("enterPressed", { kind: "enterPressed", timestamp: new Date() });
    this.scheduleIdleTimer();
  }

  private scheduleIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      const now = Date.now();
      const idleFor = now - this.lastChunkTimestamp;
      this.emit("outputIdle", {
        kind: "outputIdle",
        idleFor,
        timestamp: new Date(),
      });
    }, this.idleTimeoutMs);
  }

  private emit<K extends PtyStreamEventKind>(
    kind: K,
    event: PtyStreamEventMap[K],
  ): void {
    const listeners = this.listeners[kind];
    for (const listener of listeners) {
      listener(event);
    }
  }
}
