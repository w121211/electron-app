// src/core/services/pty/universal-snapshot-extractor.ts
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../chat/chat-session-repository.js";
import { stripAnsi } from "./pty-data-processor.js";

type Role = "user" | "assistant";

const USER_CONTENT_LINE = /^│\s*>/;
const USER_BOX_BORDER_START = /^╭/;
const USER_BOX_BORDER_END = /^╰/;
const SHELL_PROMPT =
  /^[\w.-]+@[\w.-]+\s+[^\s].*[%$#](?:\s|$)/;

const SPINNER_CHARS = new Set([
  "⠁",
  "⠂",
  "⠄",
  "⠆",
  "⠤",
  "⠦",
  "⠧",
  "⠇",
  "⠙",
  "⠹",
  "⠼",
  "⠴",
]);

function peekNextNonEmptyLine(lines: string[], fromIndex: number): string | null {
  for (let i = fromIndex; i < lines.length; i++) {
    const candidate = lines[i].trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function normalizeBoxLine(line: string): string {
  const left = line.indexOf("│");
  const right = line.lastIndexOf("│");

  let content =
    left === -1
      ? line
      : right === -1
        ? line.slice(left + 1)
        : line.slice(left + 1, right);

  content = content.replace(/\s+$/u, "");
  content = content.replace(/^\s+/u, "");

  if (content.startsWith(">")) {
    return content.slice(1).trimStart();
  }

  return content;
}

function trimMessageLines(lines: string[]): string[] {
  const normalized = [...lines];

  while (normalized.length > 0 && normalized[0].trim().length === 0) {
    normalized.shift();
  }
  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1].trim().length === 0
  ) {
    normalized.pop();
  }

  return normalized;
}

function isSpinnerLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed) {
    return false;
  }
  return SPINNER_CHARS.has(trimmed.charAt(0));
}

function shouldIgnoreLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "%") {
    return true;
  }
  if (SHELL_PROMPT.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("~/")) {
    return true;
  }

  return false;
}

export function extractMessages(snapshot: string): ChatMessage[] {
  if (!snapshot || snapshot.trim().length === 0) {
    return [];
  }

  const messages: ChatMessage[] = [];
  const strippedSnapshot = stripAnsi(snapshot);
  const lines = strippedSnapshot.split(/\r?\n/);

  let currentRole: Role | null = null;
  let currentLines: string[] = [];
  let inUserBox = false;

  const flushCurrent = (): void => {
    if (!currentRole || currentLines.length === 0) {
      currentRole = null;
      currentLines = [];
      return;
    }

    const normalizedLines = trimMessageLines(currentLines);
    if (normalizedLines.length === 0) {
      currentRole = null;
      currentLines = [];
      return;
    }

    const content = normalizedLines.join("\n").trimEnd();
    if (content.length === 0) {
      currentRole = null;
      currentLines = [];
      return;
    }

    messages.push({
      id: uuidv4(),
      message: {
        role: currentRole,
        content,
      },
      metadata: {
        timestamp: new Date(),
      },
    });

    currentRole = null;
    currentLines = [];
  };

  const ensureRole = (role: Role): void => {
    if (currentRole !== role) {
      flushCurrent();
      currentRole = role;
      currentLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inUserBox || currentRole) {
        currentLines.push("");
      }
      continue;
    }

    if (shouldIgnoreLine(line)) {
      flushCurrent();
      inUserBox = false;
      continue;
    }

    if (inUserBox) {
      if (USER_BOX_BORDER_END.test(trimmed)) {
        inUserBox = false;
        flushCurrent();
        continue;
      }

      if (trimmed.startsWith("│")) {
        currentLines.push(normalizeBoxLine(line));
      }

      continue;
    }

    if (USER_BOX_BORDER_START.test(trimmed)) {
      const nextLine = peekNextNonEmptyLine(lines, i + 1);
      if (nextLine && USER_CONTENT_LINE.test(nextLine)) {
        ensureRole("user");
        inUserBox = true;
      } else if (currentRole === "assistant") {
        currentLines.push(line.trimEnd());
      }
      continue;
    }

    if (USER_CONTENT_LINE.test(trimmed)) {
      ensureRole("user");
      inUserBox = true;
      currentLines.push(normalizeBoxLine(line));
      continue;
    }

    const assistantMarker =
      trimmed.startsWith("✦") ||
      trimmed.startsWith("ℹ") ||
      trimmed.startsWith("Tips for ") ||
      trimmed.startsWith("Loaded cached") ||
      trimmed.startsWith("Using:") ||
      isSpinnerLine(line);

    if (assistantMarker) {
      ensureRole("assistant");
      currentLines.push(line.trimEnd());
      continue;
    }

    if (currentRole === "assistant") {
      currentLines.push(line.trimEnd());
      continue;
    }

    ensureRole("assistant");
    currentLines.push(line.trimEnd());
  }

  flushCurrent();

  return messages;
}
