// tests/integration/prompt-seed.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PromptRepositoryImpl,
  type PromptRepository,
} from "../../src/core/services/prompt/prompt-repository.js";
import { PromptService } from "../../src/core/services/prompt/prompt-service.js";

describe("Prompt seeding integration", () => {
  let promptRepository: PromptRepository;
  let promptService: PromptService;
  let databasePath: string;
  let templatesDirectory: string;

  beforeAll(async () => {
    databasePath = join(tmpdir(), `prompt-seed-test-${randomUUID()}.db`);
    templatesDirectory = join(tmpdir(), `templates-${randomUUID()}`);

    await fs.mkdir(templatesDirectory, { recursive: true });

    promptRepository = new PromptRepositoryImpl({
      databaseFilePath: databasePath,
    });

    promptService = new PromptService({
      repository: promptRepository,
    });
  });

  afterAll(async () => {
    const cleanups: Array<Promise<void>> = [];

    if (databasePath) {
      cleanups.push(
        fs.unlink(databasePath).catch(() => {
          // Ignore cleanup failures
        }),
      );
    }

    if (templatesDirectory) {
      cleanups.push(
        fs.rm(templatesDirectory, { recursive: true, force: true }).catch(() => {
          // Ignore cleanup failures
        }),
      );
    }

    await Promise.all(cleanups);
  });

  it("seeds prompts from template files with frontmatter metadata", async () => {
    const template1 = `---
slug: test-prompt-1
title: Test Prompt 1
description: A test prompt for seeding
modelId: api/aigateway:openai/gpt-4o-mini
tags:
  - test
  - integration
---

This is a test prompt with variables: {{name}} and {{topic}}`;

    const template2 = `---
slug: test-prompt-2
title: Test Prompt 2
modelId: api/aigateway:google/gemini-2.5-flash-lite
---

Generate a response about {{subject}}`;

    await fs.writeFile(
      join(templatesDirectory, "test-prompt-1.prompt.md"),
      template1,
    );
    await fs.writeFile(
      join(templatesDirectory, "test-prompt-2.prompt.md"),
      template2,
    );

    const result = await promptService.seedBuiltInPrompts(templatesDirectory);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    const prompt1 = await promptService.findBySlug("test-prompt-1");
    expect(prompt1).toBeDefined();
    expect(prompt1?.slug).toBe("test-prompt-1");
    expect(prompt1?.content).toContain("{{name}}");
    expect(prompt1?.content).toContain("{{topic}}");
    expect(prompt1?.metadata?.title).toBe("Test Prompt 1");
    expect(prompt1?.metadata?.description).toBe("A test prompt for seeding");
    expect(prompt1?.metadata?.modelId).toBe("api/aigateway:openai/gpt-4o-mini");
    expect(prompt1?.metadata?.tags).toEqual(["test", "integration"]);

    const prompt2 = await promptService.findBySlug("test-prompt-2");
    expect(prompt2).toBeDefined();
    expect(prompt2?.slug).toBe("test-prompt-2");
    expect(prompt2?.content).toContain("{{subject}}");
    expect(prompt2?.metadata?.title).toBe("Test Prompt 2");
    expect(prompt2?.metadata?.modelId).toBe(
      "api/aigateway:google/gemini-2.5-flash-lite",
    );
  });

  it("updates existing prompts when content or metadata changes", async () => {
    const templatesDir = join(tmpdir(), `update-test-${randomUUID()}`);
    await fs.mkdir(templatesDir, { recursive: true });

    const initialTemplate = `---
slug: update-test
title: Initial Title
---

Initial content with {{variable}}`;

    await fs.writeFile(
      join(templatesDir, "update-test.prompt.md"),
      initialTemplate,
    );

    const firstSeed = await promptService.seedBuiltInPrompts(templatesDir);
    expect(firstSeed.created).toBe(1);

    const initialPrompt = await promptService.findBySlug("update-test");
    expect(initialPrompt?.content).toContain("Initial content");
    expect(initialPrompt?.metadata?.title).toBe("Initial Title");

    const updatedTemplate = `---
slug: update-test
title: Updated Title
description: Now with description
---

Updated content with {{variable}} and more`;

    await fs.writeFile(
      join(templatesDir, "update-test.prompt.md"),
      updatedTemplate,
    );

    const secondSeed = await promptService.seedBuiltInPrompts(templatesDir);
    expect(secondSeed.created).toBe(0);
    expect(secondSeed.updated).toBe(1);
    expect(secondSeed.skipped).toBe(0);

    const updatedPrompt = await promptService.findBySlug("update-test");
    expect(updatedPrompt?.id).toBe(initialPrompt?.id);
    expect(updatedPrompt?.content).toContain("Updated content");
    expect(updatedPrompt?.metadata?.title).toBe("Updated Title");
    expect(updatedPrompt?.metadata?.description).toBe("Now with description");

    await fs.rm(templatesDir, { recursive: true, force: true });
  });

  it("skips prompts when content and metadata are unchanged", async () => {
    const templatesDir = join(tmpdir(), `skip-test-${randomUUID()}`);
    await fs.mkdir(templatesDir, { recursive: true });

    const template = `---
slug: skip-test
title: Unchanged Prompt
---

This content will not change`;

    await fs.writeFile(join(templatesDir, "skip-test.prompt.md"), template);

    const firstSeed = await promptService.seedBuiltInPrompts(templatesDir);
    expect(firstSeed.created).toBe(1);

    const secondSeed = await promptService.seedBuiltInPrompts(templatesDir);
    expect(secondSeed.created).toBe(0);
    expect(secondSeed.updated).toBe(0);
    expect(secondSeed.skipped).toBe(1);

    const prompt = await promptService.findBySlug("skip-test");
    expect(prompt).toBeDefined();
    expect(prompt?.content).toContain("This content will not change");

    await fs.rm(templatesDir, { recursive: true, force: true });
  });

  it("handles template files without frontmatter metadata", async () => {
    const templatesDir = join(tmpdir(), `no-frontmatter-${randomUUID()}`);
    await fs.mkdir(templatesDir, { recursive: true });

    const template = `Just plain content without frontmatter`;

    await fs.writeFile(
      join(templatesDir, "no-frontmatter.prompt.md"),
      template,
    );

    const result = await promptService.seedBuiltInPrompts(templatesDir);
    expect(result.created).toBe(1);

    const prompt = await promptService.findBySlug("no-frontmatter");
    expect(prompt).toBeDefined();
    expect(prompt?.slug).toBe("no-frontmatter");
    expect(prompt?.content).toBe("Just plain content without frontmatter");
    // normalizeMetadata returns {} instead of null when no metadata
    expect(prompt?.metadata).toEqual({});

    await fs.rm(templatesDir, { recursive: true, force: true });
  });

  it("ignores non-.prompt.md files in template directory", async () => {
    await fs.writeFile(join(templatesDirectory, "readme.md"), "# README");
    await fs.writeFile(join(templatesDirectory, "notes.txt"), "Some notes");
    await fs.writeFile(
      join(templatesDirectory, "valid.prompt.md"),
      `---
slug: valid-only
---

Valid prompt content`,
    );

    const result = await promptService.seedBuiltInPrompts(templatesDirectory);
    expect(result.created).toBe(1);

    const validPrompt = await promptService.findBySlug("valid-only");
    expect(validPrompt).toBeDefined();

    const readmePrompt = await promptService.findBySlug("readme");
    expect(readmePrompt).toBeNull();

    const notesPrompt = await promptService.findBySlug("notes");
    expect(notesPrompt).toBeNull();
  });

  it("handles empty template directory gracefully", async () => {
    const emptyDirectory = join(tmpdir(), `empty-${randomUUID()}`);
    await fs.mkdir(emptyDirectory, { recursive: true });

    const result = await promptService.seedBuiltInPrompts(emptyDirectory);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    await fs.rm(emptyDirectory, { recursive: true, force: true });
  });

  it("handles non-existent template directory gracefully", async () => {
    const nonExistentDirectory = join(tmpdir(), `non-existent-${randomUUID()}`);

    const result = await promptService.seedBuiltInPrompts(
      nonExistentDirectory,
    );
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("derives slug from filename by removing .prompt.md extension", async () => {
    const template = `---
title: My Awesome Prompt
---

Content here`;

    await fs.writeFile(
      join(templatesDirectory, "my-awesome-prompt.prompt.md"),
      template,
    );

    await promptService.seedBuiltInPrompts(templatesDirectory);

    const prompt = await promptService.findBySlug("my-awesome-prompt");
    expect(prompt).toBeDefined();
    expect(prompt?.slug).toBe("my-awesome-prompt");
    expect(prompt?.metadata?.title).toBe("My Awesome Prompt");
  });

  it("maintains prompt IDs across updates", async () => {
    const template = `---
slug: stable-id-test
---

Initial version`;

    await fs.writeFile(
      join(templatesDirectory, "stable-id-test.prompt.md"),
      template,
    );

    await promptService.seedBuiltInPrompts(templatesDirectory);
    const initialPrompt = await promptService.findBySlug("stable-id-test");
    const initialId = initialPrompt?.id;

    expect(initialId).toBeDefined();

    const updatedTemplate = `---
slug: stable-id-test
---

Updated version`;

    await fs.writeFile(
      join(templatesDirectory, "stable-id-test.prompt.md"),
      updatedTemplate,
    );

    await promptService.seedBuiltInPrompts(templatesDirectory);
    const updatedPrompt = await promptService.findBySlug("stable-id-test");

    expect(updatedPrompt?.id).toBe(initialId);
    expect(updatedPrompt?.content).toContain("Updated version");
  });
});
