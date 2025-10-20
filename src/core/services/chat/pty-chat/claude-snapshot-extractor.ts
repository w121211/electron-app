// src/core/services/chat/pty-chat/claude-snapshot-extractor.ts
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../chat-session-repository.js";

/**
 * Extracts chat messages from Claude Code terminal snapshots.
 *
 * Claude Code uses specific visual markers in the terminal:
 * - User prompts: Lines starting with "> " on gray background (ESC[48;2;55;55;55m)
 * - Assistant responses: Lines starting with "⏺" (colored circle)
 * - Tool calls: Format "⏺ Tool(args)" with various colors
 * - System events: cli:newSession, cli:screenRefresh
 *
 * Handles:
 * - Multi-line user messages (with line continuations)
 * - Session boundaries (/clear command, new sessions)
 * - Tool call detection and parsing
 * - IDE selection blocks
 * - Interruptions and errors
 * - Exit to shell and restart scenarios
 */

type Role = "user" | "assistant" | "system";

// User prompt marker: gray background with "> "
// Matches: ESC[48;2;55;55;55m> ... ESC[0m or ESC[48;2;55;55;55;22m> ...
const USER_PROMPT_START = /^\x1b\[(?:48;2;55;55;55(?:;22)?m)>\s*/;

// Assistant response marker: colored circle "⏺"
// Matches various color codes followed by ⏺ and reset
const ASSISTANT_START = /^\x1b\[38;2;(?:\d+);(?:\d+);(?:\d+)(?:;22)?m⏺\x1b\[0m/;

// Clear command detection
const CLEAR_COMMAND = /^\x1b\[48;2;55;55;55(?:;22)?m>\s*\/clear\s*\x1b\[0m/;

// Session header (Claude Code banner)
const SESSION_HEADER = /^\x1b\[38;2;215;119;87m\s+▐\x1b\[48;2;0;0;0m▛███▜\x1b\[49m▌\x1b\[0m\s+\x1b\[1mClaude Code\x1b\[0m/;

// IDE selection block markers
const IDE_SELECTION_START = /<ide_selection>/;
const IDE_SELECTION_END = /<\/ide_selection>/;

// Bottom status line / input prompt area (indicates end of content)
const BOTTOM_PROMPT = /^\x1b\[38;2;136;136;136(?:;2)?m───+\x1b\[0m$/;

// Interrupt/error markers
const INTERRUPT_MARKER = /⎿\s+\x1b\[38;2;255;107;128m(?:Error:|Interrupted)/;

// Shell prompt pattern (CLI exit detection)
const SHELL_PROMPT =
  /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+\s+[~\/].*[%$#]\s*/;

/**
 * Checks if a line is part of the user's prompt input area (gray background)
 */
function isUserPromptContinuation(line: string): boolean {
  // Lines with gray background indicate user prompt continuation
  return /^\x1b\[48;2;55;55;55/.test(line);
}

/**
 * Checks if a line is part of assistant response content
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;:]*m/g, "");
}

/**
 * Extracts messages from a Claude Code terminal snapshot
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

  let inIdeSelection = false;
  let sessionCount = 0;
  let inShellMode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines at the start
    if (!line.trim() && !currentMessage) continue;

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

      // Capture shell command as system message
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

    // Detect session header (new Claude Code session)
    if (SESSION_HEADER.test(line)) {
      // Flush current message if any
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

      // Add session start marker (always, including first session)
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

      sessionCount++;
      inShellMode = false;
      continue;
    }

    // Detect /clear command (screen refresh)
    if (CLEAR_COMMAND.test(line)) {
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
          content: "cli:screenRefresh",
        },
        metadata: {
          timestamp: new Date(),
        },
      });
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

    // Track IDE selection blocks (skip them)
    if (IDE_SELECTION_START.test(line)) {
      inIdeSelection = true;
      continue;
    }
    if (IDE_SELECTION_END.test(line)) {
      inIdeSelection = false;
      continue;
    }
    if (inIdeSelection) continue;

    // Stop at bottom prompt/status line
    if (BOTTOM_PROMPT.test(line)) {
      break;
    }

    // Skip processing if in shell mode
    if (inShellMode) continue;

    // Detect user prompt start
    if (USER_PROMPT_START.test(line)) {
      // Flush previous message
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

      // Start new user message
      currentMessage = {
        role: "user",
        lines: [line],
        startLineNum: i,
      };
      continue;
    }

    // Detect assistant response start
    if (ASSISTANT_START.test(line)) {
      // Flush previous message
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

      // Start new assistant message
      currentMessage = {
        role: "assistant",
        lines: [line],
        startLineNum: i,
      };
      continue;
    }

    // Continue current message if applicable
    if (currentMessage) {
      if (currentMessage.role === "user") {
        // User messages continue on gray background lines
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
          !BOTTOM_PROMPT.test(line)
        ) {
          currentMessage.lines.push(line);
          continue;
        } else {
          // End of assistant message, but don't consume this line
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
          // Re-process this line
          i--;
          continue;
        }
      }
    }
  }

  // Flush any remaining message
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
