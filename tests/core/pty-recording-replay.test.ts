// tests/pty-recording-replay.test.ts
// Usage tips:
// - Re-run this test against a specific recording with:
//     PTY_RECORDING_FIXTURE=tmp/pty-recordings/<session>/<file>.ndjson \
//       npm run test -- --run tests/pty-recording-replay.test.ts
// - Recordings using gzip/base64 payloads can be inspected manually via:
//     npm run decode:pty -- tmp/pty-recordings/<session>/<file>.ndjson
// - Add `.golden.json` files beside fixtures to assert extractor output for regressions.
// - Set `VERBOSE_PTY_TEST=1` while replaying to emit a `<file>.messages.json` snapshot next to the source recording.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { EventBus } from "../src/core/event-bus.js";
import {
  PtyChatSession,
  type PtyChatUpdateType,
} from "../src/core/services/chat/pty-chat/pty-chat-session.js";
import {
  PtyDataProcessor,
  type PtyStreamEventKind,
  type PtyStreamEventMap,
} from "../src/core/pty/pty-data-processor.js";
import type {
  ChatMessage,
  ChatSessionData,
} from "../src/core/services/chat/chat-session-repository.js";

interface RecordingEntry {
  type: "chunk" | "write" | "info" | "meta" | "snapshot";
  timestamp: string;
  data?: string;
  message?: string;
  payload?: string;
  encoding?: string;
}

interface RecordingMetadata {
  sessionId: string;
  ptyInstanceId: string;
  shell: string;
  cwd: string;
}

interface RecordingCase {
  name: string;
  recordingPath: string;
  goldenPath?: string;
}

interface FlushSnapshot {
  kind: PtyStreamEventKind;
  messages: number;
  snapshotLength: number;
}

interface ReplayResult {
  messages: ChatMessage[];
  flushes: FlushSnapshot[];
}

class ReplayPtyDataSource {
  readonly id: string;
  readonly shell: string;
  readonly cwd: string;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private readonly writeListeners = new Set<(chunk: string) => void>();

  constructor(metadata: RecordingMetadata) {
    this.id = metadata.ptyInstanceId || "pty-recording";
    this.shell = metadata.shell || "bash";
    this.cwd = metadata.cwd || process.cwd();
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

function parseRecording(recordingPath: string): {
  metadata: RecordingMetadata;
  entries: RecordingEntry[];
} {
  const raw = readFileSync(recordingPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let metadata: RecordingMetadata = {
    sessionId: "pty-recording-session",
    ptyInstanceId: "pty-recording",
    shell: "bash",
    cwd: process.cwd(),
  };

  const entries: RecordingEntry[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RecordingEntry & Partial<RecordingMetadata>;
      if (parsed.type === "meta") {
        metadata = {
          sessionId: parsed.sessionId ?? metadata.sessionId,
          ptyInstanceId: parsed.ptyInstanceId ?? metadata.ptyInstanceId,
          shell: parsed.shell ?? metadata.shell,
          cwd: parsed.cwd ?? metadata.cwd,
        };
        continue;
      }
      if (
        parsed.type === "chunk" &&
        (!parsed.data || parsed.data.length === 0) &&
        parsed.encoding === "base64/gzip" &&
        typeof parsed.payload === "string"
      ) {
        parsed.data = gunzipSync(Buffer.from(parsed.payload, "base64")).toString("utf8");
      }
      entries.push(parsed);
    } catch {
      continue;
    }
  }

  return { metadata, entries };
}

function sanitizeMessages(messages: ChatMessage[]): Array<{
  role: ChatMessage["message"]["role"];
  content: string;
}> {
  return messages.map((message) => ({
    role: message.message.role,
    content: message.message.content,
  }));
}

function discoverRecordingCases(): RecordingCase[] {
  const cases: RecordingCase[] = [];
  const fixturesDir = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "pty-recordings",
  );

  if (existsSync(fixturesDir)) {
    const dirEntries = readdirSync(fixturesDir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (entry.isDirectory()) {
        const directoryPath = path.join(fixturesDir, entry.name);
        const files = readdirSync(directoryPath, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith(".ndjson")) {
            continue;
          }
          const recordingPath = path.join(directoryPath, file.name);
          const goldenPath = recordingPath.replace(/\.ndjson$/, ".golden.json");
          cases.push({
            name: path.relative(fixturesDir, recordingPath),
            recordingPath,
            goldenPath: existsSync(goldenPath) ? goldenPath : undefined,
          });
        }
      } else if (entry.isFile() && entry.name.endsWith(".ndjson")) {
        const recordingPath = path.join(fixturesDir, entry.name);
        const goldenPath = recordingPath.replace(/\.ndjson$/, ".golden.json");
        cases.push({
          name: entry.name,
          recordingPath,
          goldenPath: existsSync(goldenPath) ? goldenPath : undefined,
        });
      }
    }
  }

  const envFixture = process.env.PTY_RECORDING_FIXTURE;
  if (envFixture) {
    const recordingPath = path.isAbsolute(envFixture)
      ? envFixture
      : path.join(process.cwd(), envFixture);
    const goldenCandidate = recordingPath.replace(/\.ndjson$/, ".golden.json");
    cases.push({
      name: path.relative(process.cwd(), recordingPath),
      recordingPath,
      goldenPath: existsSync(goldenCandidate) ? goldenCandidate : undefined,
    });
  }

  return cases;
}

function logSnapshot(
  recordingName: string,
  event: PtyStreamEventMap[PtyStreamEventKind],
  snapshot: string,
  updateType: PtyChatUpdateType | null,
  messageCount: number,
): void {
  if (process.env.VERBOSE_PTY_TEST !== "1") {
    return;
  }

  const header = `[${recordingName}] ${event.kind} → ${updateType ?? "none"} (${messageCount} messages)`;
  const preview = snapshot.split("\n").slice(-12).join("\n");
  console.log(`${header}\n${preview}\n---`);
}

function replayRecording(
  recording: RecordingCase,
  idleTimeoutMs: number,
): ReplayResult {
  const { metadata, entries } = parseRecording(recording.recordingPath);
  const dataSource = new ReplayPtyDataSource(metadata);
  const processor = new PtyDataProcessor(dataSource, {
    sessionId: metadata.sessionId,
    idleTimeoutMs,
  });

  const eventBus = new EventBus({ environment: "server" });
  const timestamp = new Date();
  const sessionData: ChatSessionData = {
    id: metadata.sessionId,
    modelSurface: "pty",
    state: "active",
    messages: [],
    metadata: {
      external: {
        mode: "pty",
        workingDirectory: metadata.cwd,
        pty: {
          ptyInstanceId: metadata.ptyInstanceId,
        },
      },
    },
    scriptPath: null,
    scriptModifiedAt: null,
    scriptHash: null,
    scriptSnapshot: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const session = new PtyChatSession(sessionData, eventBus);
  const flushes: FlushSnapshot[] = [];

  const handleFlush = (event: PtyStreamEventMap[PtyStreamEventKind]) => {
    const snapshot = processor.getBufferedOutput();
    if (!snapshot || snapshot.trim().length === 0) {
      return;
    }

    const beforeCount = session.toChatSessionData().messages.length;
    session.updateFromSnapshot(snapshot);
    const afterMessages = session.toChatSessionData().messages.length;

    flushes.push({
      kind: event.kind,
      messages: afterMessages,
      snapshotLength: snapshot.length,
    });

    const updateType: PtyChatUpdateType | null =
      afterMessages > beforeCount ? "MESSAGE_ADDED" : null;
    logSnapshot(
      recording.name,
      event,
      snapshot,
      updateType,
      afterMessages,
    );
  };

  const unsubscribers = [
    processor.on("enterPressed", handleFlush),
    processor.on("outputIdle", handleFlush),
    processor.on("screenCleared", handleFlush),
    processor.on("sessionBanner", handleFlush),
  ];

  for (const entry of entries) {
    if (entry.type === "chunk" && typeof entry.data === "string") {
      dataSource.emitData(entry.data);
      vi.advanceTimersByTime(idleTimeoutMs + 10);
    } else if (entry.type === "write" && typeof entry.data === "string") {
      dataSource.emitWrite(entry.data);
      vi.advanceTimersByTime(idleTimeoutMs + 10);
    }
  }

  vi.runOnlyPendingTimers();

  unsubscribers.forEach((unsubscribe) => unsubscribe());
  processor.destroy();

  return {
    messages: session.toChatSessionData().messages,
    flushes,
  };
}

const RECORDING_CASES = discoverRecordingCases();

describe("PtyChatSession recordings", () => {
  const idleTimeoutMs = 50;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  if (RECORDING_CASES.length === 0) {
    it.skip("requires at least one PTY recording fixture", () => {});
    return;
  }

  for (const testCase of RECORDING_CASES) {
    it(`replays ${testCase.name}`, () => {
      const { messages, flushes } = replayRecording(testCase, idleTimeoutMs);
      expect(flushes.length).toBeGreaterThan(0);

      for (let i = 1; i < flushes.length; i++) {
        expect(flushes[i]?.messages ?? 0).toBeGreaterThanOrEqual(
          flushes[i - 1]?.messages ?? 0,
        );
      }

      for (let i = 1; i < messages.length; i++) {
        const previous = messages[i - 1];
        const current = messages[i];
        const previousTime = previous.metadata.timestamp.getTime();
        const currentTime = current.metadata.timestamp.getTime();
        expect(currentTime).toBeGreaterThanOrEqual(previousTime);
      }

      const sanitized = sanitizeMessages(messages);
      if (testCase.goldenPath) {
        const expected = JSON.parse(
          readFileSync(testCase.goldenPath, "utf8"),
        ) as { messages: ReturnType<typeof sanitizeMessages> };
        expect(sanitized).toEqual(expected.messages);
      } else if (process.env.VERBOSE_PTY_TEST === "1") {
        const outputPath = testCase.recordingPath.replace(
          /\.ndjson$/,
          ".messages.json",
        );
        try {
          writeFileSync(
            outputPath,
            `${JSON.stringify({ messages: sanitized }, null, 2)}\n`,
            "utf8",
          );
          console.log(
            `[${testCase.name}] wrote sanitized messages to ${outputPath}`,
          );
        } catch (error) {
          console.error(
            `[${testCase.name}] failed to write sanitized messages:`,
            error,
          );
          console.log(
            `[${testCase.name}] final messages:\n${JSON.stringify(
              sanitized,
              null,
              2,
            )}`,
          );
        }
      }
    });
  }
});
