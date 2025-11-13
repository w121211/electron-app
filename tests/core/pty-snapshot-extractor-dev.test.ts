// tests/pty-snapshot-extractor-dev.test.ts
// Snapshot-only extractor harness:
// - Replay snapshots from recorded PTY sessions without the live stream.
// - Run with `PTY_RECORDING_FIXTURE=/path/to/<file>.ndjson VERBOSE_PTY_TEST=1 npm run test -- --run tests/pty-snapshot-extractor-dev.test.ts`
//   to emit human-readable artifacts alongside the source recording:
//     - `<file>.snapshot.XXX.txt`  → normalized terminal snapshot (ANSI stripped)
//     - `<file>.parsed.XXX.json`   → sanitized extractor result `{ messages: [...] }`
// - Drop a matching golden at `<file>.parsed.XXX.golden.json` to freeze expectations.
// - Choose an extractor with `PTY_SNAPSHOT_EXTRACTOR=default|claude|codex|gemini`
import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { extractMessages as defaultExtractor } from "../src/core/services/chat/pty-chat/pty-snapshot-extractor.js";
import { extractMessages as claudeExtractor } from "../src/core/services/chat/pty-chat/claude-snapshot-extractor.js";
import { extractMessages as codexExtractor } from "../src/core/services/chat/pty-chat/codex-snapshot-extractor.js";
import { extractMessages as geminiExtractor } from "../src/core/services/chat/pty-chat/gemini-snapshot-extractor.js";
import { extractMessages as universalExtractor } from "../src/core/services/chat/pty-chat/universal-snapshot-extractor.js";
import { stripAnsi } from "../src/core/pty/pty-data-processor.js";
import type { ChatMessage } from "../src/core/services/chat/chat-session-repository.js";

type ExtractorKey = "default" | "claude" | "codex" | "gemini" | "universal";

const EXTRACTORS: Record<ExtractorKey, (snapshot: string) => ChatMessage[]> = {
  default: defaultExtractor,
  claude: claudeExtractor,
  codex: codexExtractor,
  gemini: geminiExtractor,
  universal: universalExtractor,
};

const selectedExtractorKey =
  (process.env.PTY_SNAPSHOT_EXTRACTOR as ExtractorKey | undefined) ?? "default";
const extractor = EXTRACTORS[selectedExtractorKey] ?? EXTRACTORS.default;

interface SnapshotCase {
  readonly name: string;
  readonly recordingPath: string;
  readonly snapshotIndex: number;
  readonly rawSnapshot: string;
}

function normalizeSnapshot(input: string): string {
  return stripAnsi(input)
    .replace(/[ \t]+$/gm, "")
    .replace(/\r/g, "")
    .trimEnd();
}

function decodeSnapshot(payload: string): string {
  return gunzipSync(Buffer.from(payload, "base64")).toString("utf8");
}

function sanitizeMessages(messages: ChatMessage[]): Array<{
  role: ChatMessage["message"]["role"];
  content: ChatMessage["message"]["content"];
}> {
  return messages.map((message) => ({
    role: message.message.role,
    content: message.message.content,
  }));
}

function parseRecordingSnapshots(recordingPath: string): SnapshotCase[] {
  const contents = readFileSync(recordingPath, "utf8");
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const snapshots: SnapshotCase[] = [];

  lines.forEach((line, idx) => {
    try {
      const entry = JSON.parse(line) as {
        type?: string;
        payload?: string;
      };
      if (
        entry.type === "snapshot" &&
        typeof entry.payload === "string" &&
        entry.payload.length > 0
      ) {
        const rawSnapshot = decodeSnapshot(entry.payload);
        snapshots.push({
          name: `${recordingPath}#${snapshots.length}`,
          recordingPath,
          snapshotIndex: snapshots.length,
          rawSnapshot,
        });
      }
    } catch {
      // ignore malformed json lines
    }
  });

  return snapshots;
}

interface RecordingCase {
  name: string;
  path: string;
  snapshots: SnapshotCase[];
}

function discoverSnapshotCases(): RecordingCase[] {
  const cases: RecordingCase[] = [];
  const fixturesDir = join(
    process.cwd(),
    "tests",
    "fixtures",
    "pty-recordings",
  );

  if (existsSync(fixturesDir)) {
    const entries = readdirSync(fixturesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(fixturesDir, entry.name);
        const files = readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith(".ndjson")) {
            continue;
          }
          const recordingPath = join(dirPath, file.name);
          const snapshots = parseRecordingSnapshots(recordingPath);
          if (snapshots.length === 0) {
            continue;
          }
          cases.push({
            name: relative(process.cwd(), recordingPath),
            path: recordingPath,
            snapshots,
          });
        }
      } else if (entry.isFile() && entry.name.endsWith(".ndjson")) {
        const recordingPath = join(fixturesDir, entry.name);
        const snapshots = parseRecordingSnapshots(recordingPath);
        if (snapshots.length === 0) {
          continue;
        }
        cases.push({
          name: relative(process.cwd(), recordingPath),
          path: recordingPath,
          snapshots,
        });
      }
    }
  }

  const envFixture = process.env.PTY_RECORDING_FIXTURE;
  if (envFixture) {
    const resolved = resolve(envFixture);
    const snapshots = parseRecordingSnapshots(resolved);
    if (snapshots.length > 0) {
      cases.push({
        name: relative(process.cwd(), resolved),
        path: resolved,
        snapshots,
      });
    }
  }

  return cases;
}

function makeSnapshotBasePath(
  recordingPath: string,
  snapshotIndex: number,
): string {
  const index = snapshotIndex.toString().padStart(3, "0");
  const baseDir = dirname(recordingPath);
  const baseName = recordingPath
    .replace(/\.ndjson$/, "")
    .split("/")
    .pop();
  const snapshotsDir = join(baseDir, "snapshots");
  mkdirSync(snapshotsDir, { recursive: true });
  return join(snapshotsDir, `${baseName}.${index}`);
}

function maybeWriteArtifacts(
  basePath: string,
  normalizedSnapshot: string,
  parsedMessages: Array<{ role: string; content: string }>,
  shouldWrite: boolean,
): void {
  if (!shouldWrite) {
    return;
  }

  writeFileSync(`${basePath}.txt`, `${normalizedSnapshot}\n`, "utf8");
  writeFileSync(
    `${basePath}.parsed.json`,
    `${JSON.stringify({ messages: parsedMessages }, null, 2)}\n`,
    "utf8",
  );
}

const cases = discoverSnapshotCases();

describe("PtySnapshotExtractorHarness", () => {
  if (cases.length === 0) {
    it.skip("requires at least one snapshot recording", () => {});
    return;
  }

  for (const recording of cases) {
    describe(recording.name, () => {
      recording.snapshots.forEach((snapshotCase) => {
        it(`snapshot #${snapshotCase.snapshotIndex + 1}`, () => {
          const rawSnapshot = snapshotCase.rawSnapshot;
          const normalized = normalizeSnapshot(rawSnapshot);
          const parsed = extractor(rawSnapshot);
          const sanitized = sanitizeMessages(parsed);

          const basePath = makeSnapshotBasePath(
            snapshotCase.recordingPath,
            snapshotCase.snapshotIndex,
          );
          const goldenPath = `${basePath}.parsed.golden.json`;

          const shouldWriteArtifacts =
            !existsSync(goldenPath) || process.env.VERBOSE_PTY_TEST === "1";

          maybeWriteArtifacts(
            basePath,
            normalized,
            sanitized,
            shouldWriteArtifacts,
          );

          if (existsSync(goldenPath)) {
            const expected = JSON.parse(readFileSync(goldenPath, "utf8")) as {
              messages: Array<{ role: string; content: string }>;
            };
            expect(sanitized).toEqual(expected.messages);
          } else {
            console.log(
              `[${recording.name} snapshot #${
                snapshotCase.snapshotIndex + 1
              }] wrote artifacts to ${dirname(basePath)}`,
            );
          }
        });
      });
    });
  }
});
