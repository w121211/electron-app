// tests/pty-chat-snapshot-extractor.test.ts
import { describe, it, expect } from "vitest";
import { extractMessages } from "../src/core/services/chat/pty-chat/pty-snapshot-extractor.js";

describe("pty-chat-snapshot-extractor", () => {
  it("should return empty array for empty snapshot", () => {
    const result = extractMessages("");
    expect(result).toEqual([]);
  });

  it("should extract user message with > marker", () => {
    const snapshot = "\x1b[0m>\x1b[0m hello world";
    const messages = extractMessages(snapshot);

    expect(messages).toHaveLength(1);
    expect(messages[0].message.role).toBe("user");
    expect(messages[0].message.content).toContain("hello world");
  });

  it("should extract assistant message with ⏺ marker", () => {
    const snapshot = "\x1b[0m⏺\x1b[0mHello! How can I help you?";
    const messages = extractMessages(snapshot);

    expect(messages).toHaveLength(1);
    expect(messages[0].message.role).toBe("assistant");
    expect(messages[0].message.content).toContain("Hello! How can I help you?");
  });

  it("should extract multiple alternating messages", () => {
    const snapshot = `\x1b[0m>\x1b[0m What is 2+2?
\x1b[0m⏺\x1b[0mThe answer is 4.
\x1b[0m>\x1b[0m Thanks!
\x1b[0m⏺\x1b[0mYou're welcome!`;

    const messages = extractMessages(snapshot);

    expect(messages).toHaveLength(4);
    expect(messages[0].message.role).toBe("user");
    expect(messages[0].message.content).toContain("What is 2+2?");
    expect(messages[1].message.role).toBe("assistant");
    expect(messages[1].message.content).toContain("The answer is 4.");
    expect(messages[2].message.role).toBe("user");
    expect(messages[2].message.content).toContain("Thanks!");
    expect(messages[3].message.role).toBe("assistant");
    expect(messages[3].message.content).toContain("You're welcome!");
  });

  it("should preserve ANSI codes in message content", () => {
    const snapshot = "\x1b[0m>\x1b[0m \x1b[1mhello\x1b[0m \x1b[31mworld\x1b[0m";
    const messages = extractMessages(snapshot);

    expect(messages).toHaveLength(1);
    // Content should include ANSI codes
    expect(messages[0].message.content).toContain("\x1b[1m");
    expect(messages[0].message.content).toContain("\x1b[31m");
  });

  it("should handle complex CLI output with ANSI formatting", () => {
    const snapshot = `\x1b[38;2;215;119;87m ▐\x1b[48;2;0;0;0m▛███▜\x1b[49m▌\x1b[39m   \x1b[1mClaude Code\x1b[22m
\x1b[0m>\x1b[0m fix the bug
\x1b[0m⏺\x1b[0mI'll help you fix the bug. Let me analyze the code.`;

    const messages = extractMessages(snapshot);

    expect(messages).toHaveLength(2);
    expect(messages[0].message.role).toBe("user");
    expect(messages[0].message.content).toContain("fix the bug");
    expect(messages[1].message.role).toBe("assistant");
    expect(messages[1].message.content).toContain("I'll help you fix the bug");
  });

  it("should handle consecutive messages of the same role", () => {
    const snapshot = `\x1b[0m>\x1b[0m message 1
\x1b[0m>\x1b[0m message 2
\x1b[0m⏺\x1b[0mresponse`;

    const messages = extractMessages(snapshot);

    // Should create separate messages for each marker
    expect(messages).toHaveLength(3);
    expect(messages[0].message.role).toBe("user");
    expect(messages[1].message.role).toBe("user");
    expect(messages[2].message.role).toBe("assistant");
  });

  it("should generate unique IDs for each message", () => {
    const snapshot = `\x1b[0m>\x1b[0m first
\x1b[0m⏺\x1b[0msecond`;

    const messages = extractMessages(snapshot);

    expect(messages[0].id).toBeTruthy();
    expect(messages[1].id).toBeTruthy();
    expect(messages[0].id).not.toBe(messages[1].id);
  });

  it("should include timestamp in metadata", () => {
    const snapshot = "\x1b[0m>\x1b[0m test";
    const messages = extractMessages(snapshot);

    expect(messages[0].metadata.timestamp).toBeInstanceOf(Date);
  });
});
