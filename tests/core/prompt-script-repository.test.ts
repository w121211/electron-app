// tests/prompt-script-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PromptScriptRepository } from "../src/core/services/prompt-script/prompt-script-repository.js";

describe("PromptScriptRepository", () => {
  let tempDir: string;
  let repository: PromptScriptRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompt-script-repo-test-"),
    );
    repository = new PromptScriptRepository();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("create", () => {
    it("creates a new empty prompt script file", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(filePath);

      expect(script.absolutePath).toBe(filePath);
      expect(script.content).toBe("");
      expect(script.kind).toBe("promptScript");

      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("creates a new prompt script file with initial content", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");
      const content = `---
title: Test Prompt
model: openai/gpt-4o-mini
---

This is the prompt body`;

      const script = await repository.create(filePath, content);

      expect(script.absolutePath).toBe(filePath);
      expect(script.content).toBe(content);
      expect(script.promptScriptParsed.metadata.title).toBe("Test Prompt");
      expect(script.promptScriptParsed.metadata.model).toBe(
        "openai/gpt-4o-mini",
      );
      expect(script.promptScriptParsed.body.trim()).toBe(
        "This is the prompt body",
      );
    });

    it("throws error when file already exists", async () => {
      const filePath = path.join(tempDir, "existing.prompt.md");

      await fs.writeFile(filePath, "existing content");

      await expect(repository.create(filePath)).rejects.toThrow(
        `File already exists: ${filePath}`,
      );
    });

    it("prevents accidental overwrites of existing files", async () => {
      const filePath = path.join(tempDir, "important.prompt.md");
      const originalContent = "important existing content";

      await fs.writeFile(filePath, originalContent);

      await expect(repository.create(filePath)).rejects.toThrow();

      const preservedContent = await fs.readFile(filePath, "utf8");
      expect(preservedContent).toBe(originalContent);
    });
  });

  describe("read", () => {
    it("reads existing prompt script file", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");
      const content = `---
title: Test
---

Body content`;

      await fs.writeFile(filePath, content);

      const script = await repository.read(filePath);

      expect(script.absolutePath).toBe(filePath);
      expect(script.content).toBe(content);
      expect(script.promptScriptParsed.metadata.title).toBe("Test");
    });

    it("parses front matter metadata correctly", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");
      const content = `---
title: My Prompt
description: A test prompt
tags:
  - test
  - example
model: anthropic/claude-3-5-sonnet-20241022
engine: api
chatSessionId: abc-123
---

Prompt body`;

      await fs.writeFile(filePath, content);

      const script = await repository.read(filePath);

      expect(script.promptScriptParsed.metadata.title).toBe("My Prompt");
      expect(script.promptScriptParsed.metadata.description).toBe(
        "A test prompt",
      );
      expect(script.promptScriptParsed.metadata.tags).toEqual([
        "test",
        "example",
      ]);
      expect(script.promptScriptParsed.metadata.model).toBe(
        "anthropic/claude-3-5-sonnet-20241022",
      );
      expect(script.promptScriptParsed.metadata.engine).toBe("api");
      expect(script.promptScriptParsed.metadata.chatSessionId).toBe("abc-123");
    });
  });

  describe("save", () => {
    it("updates existing prompt script metadata", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(filePath, "Original body");

      const updated = await repository.save(script, {
        metadata: {
          ...script.promptScriptParsed.metadata,
          title: "Updated Title",
          model: "openai/gpt-4o",
        },
      });

      expect(updated.promptScriptParsed.metadata.title).toBe("Updated Title");
      expect(updated.promptScriptParsed.metadata.model).toBe("openai/gpt-4o");
      expect(updated.promptScriptParsed.body.trim()).toBe("Original body");
    });

    it("updates existing prompt script body", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(
        filePath,
        `---
title: Test
---

Original body`,
      );

      const updated = await repository.save(script, {
        body: "Updated body content",
      });

      expect(updated.promptScriptParsed.body.trim()).toBe(
        "Updated body content",
      );
      expect(updated.promptScriptParsed.metadata.title).toBe("Test");
    });

    it("updates both metadata and body", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(filePath);

      const updated = await repository.save(script, {
        metadata: {
          ...script.promptScriptParsed.metadata,
          title: "New Title",
          chatSessionId: "session-123",
        },
        body: "New body content",
      });

      expect(updated.promptScriptParsed.metadata.title).toBe("New Title");
      expect(updated.promptScriptParsed.metadata.chatSessionId).toBe(
        "session-123",
      );
      expect(updated.promptScriptParsed.body.trim()).toBe("New body content");
    });

    it("persists changes to disk", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(filePath);

      await repository.save(script, {
        metadata: {
          ...script.promptScriptParsed.metadata,
          title: "Persisted Title",
        },
        body: "Persisted body",
      });

      const reloaded = await repository.read(filePath);
      expect(reloaded.promptScriptParsed.metadata.title).toBe(
        "Persisted Title",
      );
      expect(reloaded.promptScriptParsed.body.trim()).toBe("Persisted body");
    });

    it("throws error when saving to non-existent file", async () => {
      const filePath = path.join(tempDir, "test.prompt.md");

      const script = await repository.create(filePath);

      await fs.unlink(filePath);

      await expect(
        repository.save(script, {
          metadata: {
            ...script.promptScriptParsed.metadata,
            title: "New Title",
          },
        }),
      ).rejects.toThrow(
        "Use create() for new files, save() only updates existing files",
      );
    });
  });

  describe("integration scenarios", () => {
    it("create -> read -> save -> read workflow", async () => {
      const filePath = path.join(tempDir, "workflow.prompt.md");

      const created = await repository.create(filePath, "Initial content");
      expect(created.content).toContain("Initial content");

      const read1 = await repository.read(filePath);
      expect(read1.content).toBe(created.content);

      const saved = await repository.save(read1, {
        metadata: {
          ...read1.promptScriptParsed.metadata,
          title: "Updated",
        },
      });
      expect(saved.promptScriptParsed.metadata.title).toBe("Updated");

      const read2 = await repository.read(filePath);
      expect(read2.promptScriptParsed.metadata.title).toBe("Updated");
    });
  });
});
