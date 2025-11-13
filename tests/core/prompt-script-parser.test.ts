// tests/prompt-script-parser.test.ts
import { describe, it, expect } from "vitest";
import {
  parsePromptScriptContent,
  type PromptScriptMetadata,
} from "../src/core/services/prompt-script/prompt-script-parser.js";

describe("parsePromptScriptContent", () => {
  it("parses front matter metadata with defaults", () => {
    const content = `---
title: "Test Script"
description: "Example description"
tags: [demo, example]
model: openai/gpt-4o-mini
---

What is the capital of France?
`;

    const result = parsePromptScriptContent(content);

    expect(result.metadata.engine).toBe("pty");
    expect(result.metadata.engineDefinedInSource).toBe(false);
    expect(result.metadata.title).toBe("Test Script");
    expect(result.metadata.description).toBe("Example description");
    expect(result.metadata.tags).toEqual(["demo", "example"]);
    expect(result.metadata.model).toBe("openai/gpt-4o-mini");
    expect(result.metadata.extras).toEqual({});
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]?.content).toBe("What is the capital of France?");
    expect(result.warnings).toHaveLength(0);
  });

  it("handles engine declarations and delimiter attributes", () => {
    const content = `---
engine: api
chatSessionId: abc-123
---

First prompt
<!-- user label="Intro" input="true" -->
Second prompt
<!-- user key="follow-up" session='cli' -->
Third prompt
`;

    const result = parsePromptScriptContent(content);

    expect(result.metadata.engine).toBe("api");
    expect(result.metadata.engineDefinedInSource).toBe(true);
    expect(result.metadata.chatSessionId).toBe("abc-123");

    expect(result.prompts).toHaveLength(3);
    expect(result.prompts[0]?.content).toBe("First prompt");
    expect(result.prompts[1]?.content).toBe("Second prompt");
    expect(result.prompts[1]?.attributes).toEqual({
      label: "Intro",
      input: "true",
    });
    expect(result.prompts[2]?.attributes).toEqual({
      key: "follow-up",
      session: "cli",
    });
  });

  it("records warnings for invalid metadata types and preserves extras", () => {
    const content = `---
engine: unknown
title: 123
tags: ["valid", 123]
custom: true
---

Prompt text
`;

    const result = parsePromptScriptContent(content);

    expect(result.metadata.engine).toBe("pty");
    expect(result.metadata.engineDefinedInSource).toBe(false);
    expect(result.metadata.title).toBeUndefined();
    expect(result.metadata.tags).toEqual(["valid"]);
    expect(result.metadata.extras).toEqual({ custom: true, title: 123 });
    const warningMessages = result.warnings.map((warning) => warning.message);
    expect(warningMessages).toContain(
      "Invalid engine in prompt script front matter. Defaulting to 'pty'",
    );
    expect(warningMessages).toContain(
      "Ignoring non-string title in prompt script front matter",
    );
    expect(warningMessages).toContain(
      "Some prompt script tags are not strings and were ignored",
    );
  });

  it("ignores empty prompt blocks between delimiters", () => {
    const content = `Prompt 1
<!-- user -->

<!-- user -->
Prompt 2
`;

    const result = parsePromptScriptContent(content);

    expect(result.prompts.map((prompt) => prompt.content)).toEqual([
      "Prompt 1",
      "Prompt 2",
    ]);
  });
});
