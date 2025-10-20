// src/core/services/chat/pty-chat/codex-snapshot-extractor.ts
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../chat-session-repository.js";

/**
 * Extracts chat messages from OpenAI Codex terminal snapshots.
 *
 * Codex CLI uses specific visual markers:
 * - Session start: Box with ">_ OpenAI Codex"
 * - User prompts: Lines starting with cyan bar "▌ "
 * - Assistant responses: Lines starting with "> "
 * - Interruptions: Red square "■ Conversation interrupted"
 * - Tool calls: Various colored indicators
 *
 * Handles:
 * - Multi-line user messages
 * - Session boundaries
 * - Tool call detection
 * - Interruptions and errors
 * - Exit to shell scenarios
 */

type Role = "user" | "assistant" | "system";

// Session header (Codex banner box)
const SESSION_HEADER =
  /^\[2m╭────────────────────────────────────────────╮\n│ >_ \[1;22mOpenAI Codex/;

// User prompt marker: cyan bar
const USER_PROMPT_START = /^\[36(?:;2)?m▌ \[39m/;

// Assistant response marker: plain "> " prefix
const ASSISTANT_START = /^>\s+/;

// Interruption marker
const INTERRUPT_MARKER = /^\[31;22m■ Conversation interrupted/;

// Shell prompt pattern
const SHELL_PROMPT =
  /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\s+[~\/].*[%$#]\s*/;

// Working indicator (skip these lines)
const WORKING_INDICATOR = /^\[2C\[38;2;102;102;102;1;22mWorking/;

// Bottom input prompt
const BOTTOM_PROMPT = /^\[36m⏎\[39m send.*context left$/;

/**
 * Strips ANSI escape codes for clean text extraction
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;:]*m/g, "");
}

/**
 * Checks if line is continuation of user input
 */
function isUserPromptContinuation(line: string): boolean {
  return /^\[36(?:;2)?m▌ \[39m/.test(line);
}

/**
 * Extracts messages from a Codex terminal snapshot
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines at the start
    if (!line.trim() && !currentMessage) continue;

    // Skip working indicators
    if (WORKING_INDICATOR.test(line)) continue;

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

      if (!inShellMode) {
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

    // Detect session header
    if (SESSION_HEADER.test(line)) {
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

      inShellMode = false;
      continue;
    }

    // Detect interruptions
    if (INTERRUPT_MARKER.test(line)) {
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

    // Stop at bottom prompt
    if (BOTTOM_PROMPT.test(line)) {
      break;
    }

    // Skip processing if in shell mode
    if (inShellMode) continue;

    // Detect user prompt start
    if (USER_PROMPT_START.test(line)) {
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
        role: "user",
        lines: [line],
        startLineNum: i,
      };
      continue;
    }

    // Detect assistant response start
    if (ASSISTANT_START.test(line) && !currentMessage) {
      currentMessage = {
        role: "assistant",
        lines: [line],
        startLineNum: i,
      };
      continue;
    }

    // Continue current message
    if (currentMessage) {
      if (currentMessage.role === "user") {
        if (isUserPromptContinuation(line)) {
          currentMessage.lines.push(line);
          continue;
        } else {
          // End of user message
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
      } else if (currentMessage.role === "assistant") {
        // Assistant messages continue until next marker
        if (
          !USER_PROMPT_START.test(line) &&
          !ASSISTANT_START.test(line) &&
          !BOTTOM_PROMPT.test(line) &&
          !INTERRUPT_MARKER.test(line)
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
