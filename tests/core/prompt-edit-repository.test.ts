// tests/prompt-edit-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { PromptEditRepositoryImpl, type PromptEdit } from "../src/core/services/prompt/prompt-edit-repository.js";

describe("PromptEditRepository", () => {
  let repository: PromptEditRepositoryImpl;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = `/tmp/test-prompt-edit-${randomUUID()}.db`;
    repository = new PromptEditRepositoryImpl({ databaseFilePath: testDbPath });
  });

  afterEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  });

  describe("create", () => {
    it("should create a new prompt edit", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Draft content",
        updatedAt: new Date(),
      };

      const created = await repository.create(promptEdit);

      expect(created.id).toBe(promptEdit.id);
      expect(created.promptScriptPath).toBe(promptEdit.promptScriptPath);
      expect(created.contentDraft).toBe(promptEdit.contentDraft);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a prompt edit with null promptScriptPath", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: null,
        contentDraft: "Draft content",
        updatedAt: new Date(),
      };

      const created = await repository.create(promptEdit);

      expect(created.id).toBe(promptEdit.id);
      expect(created.promptScriptPath).toBeNull();
      expect(created.contentDraft).toBe(promptEdit.contentDraft);
    });

    it("should create a prompt edit with null contentDraft", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: null,
        updatedAt: new Date(),
      };

      const created = await repository.create(promptEdit);

      expect(created.id).toBe(promptEdit.id);
      expect(created.contentDraft).toBeNull();
    });
  });

  describe("findById", () => {
    it("should find a prompt edit by id", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Draft content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);
      const found = await repository.findById(promptEdit.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(promptEdit.id);
      expect(found?.promptScriptPath).toBe(promptEdit.promptScriptPath);
      expect(found?.contentDraft).toBe(promptEdit.contentDraft);
    });

    it("should return null if prompt edit not found", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("findByScriptPath", () => {
    it("should find a prompt edit by script path", async () => {
      const scriptPath = "/path/to/script.md";
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: scriptPath,
        contentDraft: "Draft content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);
      const found = await repository.findByScriptPath(scriptPath);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(promptEdit.id);
      expect(found?.promptScriptPath).toBe(scriptPath);
    });

    it("should return null if script path not found", async () => {
      const found = await repository.findByScriptPath("/non/existent/path.md");
      expect(found).toBeNull();
    });
  });

  describe("update", () => {
    it("should update prompt edit content", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Original content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);

      const newContent = "Updated content";
      const newUpdatedAt = new Date();
      const updated = await repository.update(promptEdit.id, {
        contentDraft: newContent,
        updatedAt: newUpdatedAt,
      });

      expect(updated.contentDraft).toBe(newContent);
      expect(updated.updatedAt.getTime()).toBe(newUpdatedAt.getTime());
      expect(updated.promptScriptPath).toBe(promptEdit.promptScriptPath);
    });

    it("should update prompt script path", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);

      const newPath = "/new/path/to/script.md";
      const updated = await repository.update(promptEdit.id, {
        promptScriptPath: newPath,
      });

      expect(updated.promptScriptPath).toBe(newPath);
      expect(updated.contentDraft).toBe(promptEdit.contentDraft);
    });

    it("should update multiple fields at once", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Original content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);

      const newPath = "/new/path.md";
      const newContent = "New content";
      const newUpdatedAt = new Date();

      const updated = await repository.update(promptEdit.id, {
        promptScriptPath: newPath,
        contentDraft: newContent,
        updatedAt: newUpdatedAt,
      });

      expect(updated.promptScriptPath).toBe(newPath);
      expect(updated.contentDraft).toBe(newContent);
      expect(updated.updatedAt.getTime()).toBe(newUpdatedAt.getTime());
    });

    it("should throw error if prompt edit not found", async () => {
      await expect(
        repository.update("non-existent-id", { contentDraft: "New content" })
      ).rejects.toThrow();
    });
  });

  describe("listRecent", () => {
    it("should list recent prompt edits ordered by updatedAt", async () => {
      const now = new Date();
      const promptEdit1: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path1.md",
        contentDraft: "Content 1",
        updatedAt: new Date(now.getTime() - 3000),
      };
      const promptEdit2: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path2.md",
        contentDraft: "Content 2",
        updatedAt: new Date(now.getTime() - 1000),
      };
      const promptEdit3: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path3.md",
        contentDraft: "Content 3",
        updatedAt: new Date(now.getTime() - 2000),
      };

      await repository.create(promptEdit1);
      await repository.create(promptEdit2);
      await repository.create(promptEdit3);

      const recent = await repository.listRecent();

      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe(promptEdit2.id); // Most recent
      expect(recent[1].id).toBe(promptEdit3.id);
      expect(recent[2].id).toBe(promptEdit1.id); // Oldest
    });

    it("should limit results to specified limit", async () => {
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await repository.create({
          id: randomUUID(),
          promptScriptPath: `/path${i}.md`,
          contentDraft: `Content ${i}`,
          updatedAt: new Date(now.getTime() - i * 1000),
        });
      }

      const recent = await repository.listRecent(3);
      expect(recent).toHaveLength(3);
    });

    it("should return empty array if no edits exist", async () => {
      const recent = await repository.listRecent();
      expect(recent).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("should delete a prompt edit", async () => {
      const promptEdit: PromptEdit = {
        id: randomUUID(),
        promptScriptPath: "/path/to/script.md",
        contentDraft: "Content",
        updatedAt: new Date(),
      };

      await repository.create(promptEdit);
      await repository.delete(promptEdit.id);

      const found = await repository.findById(promptEdit.id);
      expect(found).toBeNull();
    });

    it("should not throw error when deleting non-existent edit", async () => {
      await expect(repository.delete("non-existent-id")).resolves.not.toThrow();
    });
  });
});
