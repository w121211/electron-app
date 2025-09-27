// examples/cli-chat-extractor.ts

/**
 * Simple extractor for CLI model chat snapshots.
 * - Reads xterm buffer text (raw) and preserves all ASCII/ANSI sequences.
 * - Detects user and model messages using explicit terminal markers:
 *   - User start: /^(?:\x1b\[[0-9;:]*m)*>\x1b\[0m /
 *   - Model start: /^(?:\x1b\[[0-9;:]*m)*⏺\x1b\[0m/
 * - Messages may not be pairs; extractor emits sequence as found.
 * - Outputs JSON to stdout: { file, messages: [{ role, text }] }
 */

import { readFileSync } from "node:fs";
import { argv, stdout } from "node:process";

type Role = "user" | "model";

interface Message {
  role: Role;
  text: string;
}

interface ExtractionResult {
  file: string;
  messages: Message[];
}

// Combined start-marker regex (multiline):
// - Optional ANSI prefix: (?:\x1b\[[0-9;:]*m)*
// - Marker group captures either ">\x1b[0m " or "⏺\x1b[0m"
// - Anchored to line start: ^ with m-flag
const START_RE: RegExp = new RegExp(
  String.raw`^(?:\x1b\[[0-9;:]*m)*(?<marker>>\x1b\[0m |⏺\x1b\[0m)`,
  "gm",
);

function roleFromMarker(marker: string): Role {
  // Marker includes the exact terminal char and reset: ">\x1b[0m " or "⏺\x1b[0m"
  return marker.startsWith(">") ? "user" : "model";
}

function extractMessages(raw: string): Message[] {
  const messages: Message[] = [];
  const indices: Array<{ index: number; marker: string }> = [];

  // Find all start markers with their absolute indices
  for (let m = START_RE.exec(raw); m !== null; m = START_RE.exec(raw)) {
    const idx = m.index;
    const marker = m.groups?.marker ?? "";
    indices.push({ index: idx, marker });
  }

  if (indices.length === 0) return messages;

  // Build message slices from each start to the next start (or EOF)
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].index : raw.length;
    const chunk = raw.slice(start.index, end);
    messages.push({ role: roleFromMarker(start.marker), text: chunk });
  }

  return messages;
}

function main(): void {
  const inputPath: string | undefined = argv[2];
  if (!inputPath) {
    // Minimal usage hint; no extra documentation output
    console.error("Usage: ts-node examples/cli-chat-extractor.ts <snapshot.txt>");
    process.exitCode = 1;
    return;
  }

  // Read as UTF-8 string; do not strip or transform bytes
  const raw: string = readFileSync(inputPath, { encoding: "utf8" });
  const messages = extractMessages(raw);

  const result: ExtractionResult = { file: inputPath, messages };
  stdout.write(JSON.stringify(result));
}

main();

