// src/core/services/pty/pty-chat-snapshot-extractor.ts
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../chat/chat-session-repository.js";

/**
 * Extracts chat messages from CLI model terminal snapshots.
 * Based on the tested cli-chat-extractor.ts implementation.
 *
 * - Detects user and model messages using explicit terminal markers:
 *   - User start: /^(?:\x1b\[[0-9;:]*m)*>\x1b\[0m /
 *   - Model start: /^(?:\x1b\[[0-9;:]*m)*⏺\x1b\[0m/
 * - Preserves all ASCII/ANSI sequences in message content
 * - Messages may not be pairs; extractor emits sequence as found
 */

type Role = "user" | "assistant";

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
  return marker.startsWith(">") ? "user" : "assistant";
}

export function extractMessages(snapshot: string): ChatMessage[] {
  if (!snapshot || snapshot.trim().length === 0) {
    return [];
  }

  const messages: ChatMessage[] = [];
  const indices: Array<{ index: number; marker: string }> = [];

  // Find all start markers with their absolute indices
  for (let m = START_RE.exec(snapshot); m !== null; m = START_RE.exec(snapshot)) {
    const idx = m.index;
    const marker = m.groups?.marker ?? "";
    indices.push({ index: idx, marker });
  }

  if (indices.length === 0) return messages;

  // Build message slices from each start to the next start (or EOF)
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].index : snapshot.length;
    const chunk = snapshot.slice(start.index, end);

    messages.push({
      id: uuidv4(),
      message: {
        role: roleFromMarker(start.marker),
        content: chunk,
      },
      metadata: {
        timestamp: new Date(),
      },
    });
  }

  return messages;
}
