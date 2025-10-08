// tests/pty-message-matcher.test.ts
import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../src/core/services/chat/chat-session-repository.js";
import {
  findSimilarMessageIndex,
  messagesAreSimilar,
} from "../src/core/services/pty/pty-message-matcher.js";

function createMessage(content: string, role: "user" | "assistant"): ChatMessage {
  return {
    id: uuidv4(),
    message: {
      role,
      content,
    },
    metadata: {
      timestamp: new Date(),
    },
  };
}

describe("messagesAreSimilar", () => {
  it("returns true for identical messages", () => {
    const existing = createMessage("> prompt\n", "user");
    const candidate = createMessage("> prompt\n", "user");

    expect(messagesAreSimilar(existing, candidate)).toBe(true);
  });

  it("returns true when content differs only by whitespace reflow", () => {
    const existing = createMessage(
      "⏺\x1b[0m This is a long response that wraps\nonto the next line",
      "assistant",
    );
    const candidate = createMessage(
      "⏺\x1b[0m This is a long response that wraps onto the next line",
      "assistant",
    );

    expect(messagesAreSimilar(existing, candidate)).toBe(true);
  });

  it("returns false when messages diverge significantly", () => {
    const existing = createMessage("> run build\n", "user");
    const candidate = createMessage("> run build\nbuild finished\n", "user");

    expect(messagesAreSimilar(existing, candidate)).toBe(false);
  });
});

describe("findSimilarMessageIndex", () => {
  it("finds the index of a similar message", () => {
    const existing = createMessage("> run tests\n", "user");
    const candidates = [
      createMessage("> another command\n", "user"),
      createMessage("> run tests\n", "user"),
    ];

    expect(findSimilarMessageIndex(existing, candidates)).toBe(1);
  });

  it("returns -1 when no similar message exists", () => {
    const existing = createMessage("> run tests\n", "user");
    const candidates = [
      createMessage("⏺\x1b[0m started running tests", "assistant"),
    ];

    expect(findSimilarMessageIndex(existing, candidates)).toBe(-1);
  });
});
