// src/core/services/pty/gemini-snapshot-extractor.ts
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../chat/chat-session-repository.js";

/**
 * Extracts chat messages from Google Gemini CLI terminal snapshots.
 *
 * Gemini CLI uses specific visual markers:
 * - Session start: Colorful gradient banner (█░ characters with RGB colors)
 * - User prompts: Text in bordered boxes starting with "│  > "
 * - Assistant responses: Lines starting with "✦ " (sparkle character)
 * - Tool approvals: Boxes with "✓" checkmark
 * - Interruptions: "ℹRequest cancelled"
 *
 * Handles:
 * - Multi-line user messages in boxes
 * - Session boundaries
 * - Tool call detection and approvals
 * - Request cancellations
 * - Exit to shell scenarios
 */

type Role = "user" | "assistant" | "system";

// Session header (gradient banner - multiple lines of █░ with RGB colors)
const SESSION_HEADER = /^\[38;2;\d+;\d+;\d+m [█░]/;

// User input box start
const USER_PROMPT_BOX_START = /^╭────/;
const USER_PROMPT_BOX_END = /^╰────/;

// Assistant response marker (sparkle)
const ASSISTANT_START =
  /^\[38;2;203;166;247m✦ \[38;2;205;214;244m/;

// Request cancelled
const REQUEST_CANCELLED = /^\[38;2;249;226;175mℹRequest cancelled/;

// Shell prompt pattern
const SHELL_PROMPT =
  /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\s+[~\/].*[%$#]\s*/;

// Bottom status line
const BOTTOM_STATUS =
  /^\[36m⏎\[39m send.*context left$/;

/**
 * Strips ANSI escape codes for clean text extraction
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;:]*m/g, "");
}

/**
 * Checks if line is part of user input box
 */
function isUserInputBoxLine(line: string): boolean {
  return (
    /^│\[0m\s+\[38;2;108;112;134m/.test(line) ||
    /^│\[0m/.test(line)
  );
}

/**
 * Extracts messages from a Gemini terminal snapshot
 */
export function extractMessages(snapshot: string): ChatMessage[] {
  if (!snapshot || snapshot.trim().length === 0) {
    return [];
  }

  const lines = snapshot.split("\n");
  const messages: ChatMessage[] = [];
  let currentMessage: {
    role: Role;
    lines: string[];
    startLineNum: number;
  } | null = null;

  let inShellMode = false;
  let inUserBox = false;
  let sessionStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines at the start
    if (!line.trim() && !currentMessage && !inUserBox) continue;

    // Detect session header (gradient banner)
    if (SESSION_HEADER.test(line) && !sessionStarted) {
      if (currentMessage) {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
      }

      messages.push({
        id: uuidv4(),
        message: {
          role: "system",
          content: "cli:start",
        },
        metadata: {
          timestamp: new Date(),
        },
      });

      sessionStarted = true;
      inShellMode = false;
      continue;
    }

    // Detect shell prompt (CLI exit)
    if (SHELL_PROMPT.test(line)) {
      if (currentMessage) {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
      }

      if (!inShellMode && sessionStarted) {
        messages.push({
          id: uuidv4(),
          message: {
            role: "system",
            content: "cli:exit",
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        inShellMode = true;
      }

      // Capture shell command
      const shellCommand = stripAnsi(line).trim();
      if (shellCommand) {
        messages.push({
          id: uuidv4(),
          message: {
            role: "system",
            content: `shell:${shellCommand}`,
          },
          metadata: {
            timestamp: new Date(),
          },
        });
      }
      continue;
    }

    // Detect request cancelled
    if (REQUEST_CANCELLED.test(line)) {
      if (currentMessage) {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
      }

      messages.push({
        id: uuidv4(),
        message: {
          role: "system",
          content: "cli:interrupted",
        },
        metadata: {
          timestamp: new Date(),
        },
      });
      continue;
    }

    // Stop at bottom status
    if (BOTTOM_STATUS.test(line)) {
      break;
    }

    // Skip processing if in shell mode
    if (inShellMode) continue;

    // Detect user prompt box start
    if (USER_PROMPT_BOX_START.test(line)) {
      if (currentMessage && currentMessage.role === "assistant") {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
      }

      inUserBox = true;
      if (!currentMessage) {
        currentMessage = {
          role: "user",
          lines: [],
          startLineNum: i,
        };
      }
      continue;
    }

    // Detect user prompt box end
    if (USER_PROMPT_BOX_END.test(line)) {
      inUserBox = false;

      if (currentMessage && currentMessage.role === "user") {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
      }
      continue;
    }

    // Collect user input lines inside box
    if (inUserBox && isUserInputBoxLine(line)) {
      if (currentMessage) {
        currentMessage.lines.push(line);
      }
      continue;
    }

    // Detect assistant response start
    if (ASSISTANT_START.test(line)) {
      if (currentMessage) {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
      }

      currentMessage = {
        role: "assistant",
        lines: [line],
        startLineNum: i,
      };
      continue;
    }

    // Continue current assistant message
    if (
      currentMessage &&
      currentMessage.role === "assistant" &&
      !inUserBox
    ) {
      if (
        !ASSISTANT_START.test(line) &&
        !USER_PROMPT_BOX_START.test(line) &&
        !BOTTOM_STATUS.test(line) &&
        !REQUEST_CANCELLED.test(line)
      ) {
        currentMessage.lines.push(line);
        continue;
      } else {
        messages.push({
          id: uuidv4(),
          message: {
            role: currentMessage.role,
            content: currentMessage.lines.join("\n"),
          },
          metadata: {
            timestamp: new Date(),
          },
        });
        currentMessage = null;
        i--;
        continue;
      }
    }
  }

  // Flush remaining message
  if (currentMessage) {
    messages.push({
      id: uuidv4(),
      message: {
        role: currentMessage.role,
        content: currentMessage.lines.join("\n"),
      },
      metadata: {
        timestamp: new Date(),
      },
    });
  }

  return messages;
}
