// src/core/services/pty/pty-data-processor.test.ts
// PTY recording quick guide:
// - Run `npm run dev` and open a PTY chat; chunks stream into `tmp/pty-recordings/<sessionId>/<timestamp>-<ptyId>.ndjson`.
// - Inspect captures with a Node one-liner, e.g.:
//     PTY_RECORDING_FIXTURE=tmp/pty-recordings/<file>.ndjson node -e "const fs = require('fs'); const lines = fs.readFileSync(process.env.PTY_RECORDING_FIXTURE,'utf8').trim().split(/\n/); for (const line of lines) console.log(JSON.parse(line));"
// - Replay a recording in this test by running:
//     PTY_RECORDING_FIXTURE=tmp/pty-recordings/<file>.ndjson npm run test -- --run src/core/services/pty/pty-data-processor.test.ts
// - Set `PTY_RECORDING_DISABLED=1` to skip capturing or `PTY_RECORDING_DIR=/path` to change the output location.

import {
  readFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PtyDataProcessor } from "./pty-data-processor.js";

class TestPtyDataSource {
  readonly id: string;
  readonly shell: string;
  readonly cwd: string;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private readonly writeListeners = new Set<(chunk: string) => void>();

  constructor(id = "pty-test") {
    this.id = id;
    this.shell = "bash";
    this.cwd = process.cwd();
  }

  emitData(chunk: string): void {
    for (const listener of this.dataListeners) {
      listener(chunk);
    }
  }

  emitWrite(chunk: string): void {
    for (const listener of this.writeListeners) {
      listener(chunk);
    }
  }

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onWrite(listener: (data: string) => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }
}

function loadChunksFromRecording(filePath: string): string[] {
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const chunks: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; data?: string };
      if (parsed.type === "chunk" && typeof parsed.data === "string") {
        chunks.push(parsed.data);
      }
    } catch {
      continue;
    }
  }
  return chunks;
}

describe("PtyDataProcessor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits events for banners, /clear, enter presses, and idle output", () => {
    const source = new TestPtyDataSource();
    const processor = new PtyDataProcessor(source, { sessionId: "session-test" });

    const bannerSpy = vi.fn();
    const clearSpy = vi.fn();
    const enterSpy = vi.fn();
    const idleSpy = vi.fn();
    const rawSpy = vi.fn();

    processor.on("sessionBanner", bannerSpy);
    processor.on("screenCleared", clearSpy);
    processor.on("enterPressed", enterSpy);
    processor.on("outputIdle", idleSpy);
    processor.on("rawChunk", rawSpy);

    source.emitData("\x1b[38;2;215;119;87m Claude Code v2.0.8");
    source.emitData("> /clear \x1b[0m");
    source.emitWrite("echo hi\r");

    expect(bannerSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(rawSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(350);
    expect(idleSpy).toHaveBeenCalledTimes(1);

    processor.destroy();
  });

  it("replays a recorded stream when PTY_RECORDING_FIXTURE is set", () => {
    const fixtureName = process.env.PTY_RECORDING_FIXTURE;
    if (!fixtureName) {
      return;
    }

    const fixturePath = fixtureName.startsWith("/")
      ? fixtureName
      : join(process.cwd(), fixtureName);
    const chunks = loadChunksFromRecording(fixturePath);
    if (chunks.length === 0) {
      return;
    }

    const source = new TestPtyDataSource("pty-replay");
    const processor = new PtyDataProcessor(source, { sessionId: "session-test" });
    const rawSpy = vi.fn();
    processor.on("rawChunk", rawSpy);

    for (const chunk of chunks) {
      source.emitData(chunk);
    }

    vi.advanceTimersByTime(350);

    expect(rawSpy).toHaveBeenCalled();
    expect(processor.getBufferedOutput().length).toBeGreaterThan(0);

    processor.destroy();
  });

  it("records compressed snapshots when recorder is enabled", async () => {
    vi.useRealTimers();
    const previousRecordingDir = process.env.PTY_RECORDING_DIR;
    const previousDevServer = process.env.ELECTRON_VITE_DEV_SERVER_URL;
    const previousDisabled = process.env.PTY_RECORDING_DISABLED;

    const tempDir = mkdtempSync(join(tmpdir(), "pty-recording-"));
    process.env.PTY_RECORDING_DIR = tempDir;
    process.env.ELECTRON_VITE_DEV_SERVER_URL = "http://localhost";
    delete process.env.PTY_RECORDING_DISABLED;

    try {
      const source = new TestPtyDataSource("pty-snapshot-test");
      const processor = new PtyDataProcessor(source, {
        sessionId: "session-snapshot-test",
      });

      const payload = "snapshot payload value";
      processor.recordSnapshot("enterPressed", payload);
      processor.destroy();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const sessionDir = join(tempDir, "session-snapshot-test");
      const files = readdirSync(sessionDir);
      expect(files.length).toBeGreaterThan(0);

      const contents = readFileSync(join(sessionDir, files[0]), "utf8");
      const entries = contents
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      const entryTypes = entries.map((entry) => entry.type ?? null);
      expect(entryTypes).toContain("snapshot");

      const snapshotEntry = entries.find(
        (entry) => entry.type === "snapshot",
      ) as Record<string, unknown> | undefined;

      expect(snapshotEntry).toBeDefined();
      expect(snapshotEntry?.trigger).toBe("enterPressed");
      expect(snapshotEntry?.encoding).toBe("base64/gzip");

      const decoded = gunzipSync(
        Buffer.from((snapshotEntry?.payload as string) ?? "", "base64"),
      ).toString("utf8");

      expect(decoded).toBe(payload);
      expect(snapshotEntry?.originalBytes).toBe(
        Buffer.byteLength(payload, "utf8"),
      );
    } finally {
      vi.useFakeTimers();
      if (previousRecordingDir === undefined) {
        delete process.env.PTY_RECORDING_DIR;
      } else {
        process.env.PTY_RECORDING_DIR = previousRecordingDir;
      }
      if (previousDevServer === undefined) {
        delete process.env.ELECTRON_VITE_DEV_SERVER_URL;
      } else {
        process.env.ELECTRON_VITE_DEV_SERVER_URL = previousDevServer;
      }
      if (previousDisabled === undefined) {
        delete process.env.PTY_RECORDING_DISABLED;
      } else {
        process.env.PTY_RECORDING_DISABLED = previousDisabled;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
