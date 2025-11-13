// tests/prompt-edit-service.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PromptEditService } from "../src/core/services/prompt/prompt-edit-service.js";
import type { PromptEditRepository, PromptEdit } from "../src/core/services/prompt/prompt-edit-repository.js";

describe("PromptEditService", () => {
  let service: PromptEditService;
  let mockRepository: PromptEditRepository;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByScriptPath: vi.fn(),
      listRecent: vi.fn(),
      delete: vi.fn(),
    };

    service = new PromptEditService(mockRepository);
  });

  describe("saveEdit", () => {
    describe("when creating a new edit", () => {
      it("should create a new prompt edit without editId", async () => {
        const draftContent = "Draft content";
        const createdEdit: PromptEdit = {
          id: randomUUID(),
          promptScriptPath: null,
          contentDraft: draftContent,
          updatedAt: new Date(),
        };

        vi.mocked(mockRepository.create).mockResolvedValue(createdEdit);

        const result = await service.saveEdit({ draftContent });

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            promptScriptPath: null,
            contentDraft: draftContent,
          })
        );
        expect(result).toEqual(createdEdit);
      });

      it("should generate a UUID for new edits", async () => {
        const draftContent = "Draft content";
        const createdEdit: PromptEdit = {
          id: randomUUID(),
          promptScriptPath: null,
          contentDraft: draftContent,
          updatedAt: new Date(),
        };

        vi.mocked(mockRepository.create).mockResolvedValue(createdEdit);

        await service.saveEdit({ draftContent });

        expect(mockRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
          })
        );

        const createCall = vi.mocked(mockRepository.create).mock.calls[0][0];
        expect(createCall.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });

      it("should set updatedAt to current time", async () => {
        const draftContent = "Draft content";
        const beforeCall = new Date();

        const createdEdit: PromptEdit = {
          id: randomUUID(),
          promptScriptPath: null,
          contentDraft: draftContent,
          updatedAt: new Date(),
        };

        vi.mocked(mockRepository.create).mockResolvedValue(createdEdit);

        await service.saveEdit({ draftContent });

        const afterCall = new Date();
        const createCall = vi.mocked(mockRepository.create).mock.calls[0][0];

        expect(createCall.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
        expect(createCall.updatedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      });
    });

    describe("when updating an existing edit", () => {
      it("should update existing prompt edit with editId", async () => {
        const editId = randomUUID();
        const draftContent = "Updated content";
        const existingEdit: PromptEdit = {
          id: editId,
          promptScriptPath: "/path/to/script.md",
          contentDraft: "Original content",
          updatedAt: new Date(),
        };
        const updatedEdit: PromptEdit = {
          ...existingEdit,
          contentDraft: draftContent,
          updatedAt: new Date(),
        };

        vi.mocked(mockRepository.findById).mockResolvedValue(existingEdit);
        vi.mocked(mockRepository.update).mockResolvedValue(updatedEdit);

        const result = await service.saveEdit({ editId, draftContent });

        expect(mockRepository.findById).toHaveBeenCalledWith(editId);
        expect(mockRepository.update).toHaveBeenCalledWith(
          editId,
          expect.objectContaining({
            contentDraft: draftContent,
            updatedAt: expect.any(Date),
          })
        );
        expect(result).toEqual(updatedEdit);
      });

      it("should throw error if edit not found", async () => {
        const editId = randomUUID();
        const draftContent = "Updated content";

        vi.mocked(mockRepository.findById).mockResolvedValue(null);

        await expect(service.saveEdit({ editId, draftContent })).rejects.toThrow(
          `Prompt edit ${editId} not found`
        );

        expect(mockRepository.update).not.toHaveBeenCalled();
      });

      it("should update updatedAt timestamp on update", async () => {
        const editId = randomUUID();
        const draftContent = "Updated content";
        const beforeCall = new Date();

        const existingEdit: PromptEdit = {
          id: editId,
          promptScriptPath: "/path/to/script.md",
          contentDraft: "Original content",
          updatedAt: new Date(Date.now() - 10000),
        };

        const updatedEdit: PromptEdit = {
          ...existingEdit,
          contentDraft: draftContent,
          updatedAt: new Date(),
        };

        vi.mocked(mockRepository.findById).mockResolvedValue(existingEdit);
        vi.mocked(mockRepository.update).mockResolvedValue(updatedEdit);

        await service.saveEdit({ editId, draftContent });

        const afterCall = new Date();
        const updateCall = vi.mocked(mockRepository.update).mock.calls[0][1];

        expect(updateCall.updatedAt).toBeDefined();
        expect(updateCall.updatedAt!.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
        expect(updateCall.updatedAt!.getTime()).toBeLessThanOrEqual(afterCall.getTime());
      });
    });
  });

  describe("getRecentEdits", () => {
    it("should get recent edits with default limit", async () => {
      const mockEdits: PromptEdit[] = [
        {
          id: randomUUID(),
          promptScriptPath: "/path1.md",
          contentDraft: "Content 1",
          updatedAt: new Date(),
        },
        {
          id: randomUUID(),
          promptScriptPath: "/path2.md",
          contentDraft: "Content 2",
          updatedAt: new Date(),
        },
      ];

      vi.mocked(mockRepository.listRecent).mockResolvedValue(mockEdits);

      const result = await service.getRecentEdits();

      expect(mockRepository.listRecent).toHaveBeenCalledWith(50);
      expect(result).toEqual(mockEdits);
    });

    it("should get recent edits with custom limit", async () => {
      const mockEdits: PromptEdit[] = [
        {
          id: randomUUID(),
          promptScriptPath: "/path1.md",
          contentDraft: "Content 1",
          updatedAt: new Date(),
        },
      ];

      vi.mocked(mockRepository.listRecent).mockResolvedValue(mockEdits);

      const result = await service.getRecentEdits(10);

      expect(mockRepository.listRecent).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockEdits);
    });

    it("should return empty array when no edits exist", async () => {
      vi.mocked(mockRepository.listRecent).mockResolvedValue([]);

      const result = await service.getRecentEdits();

      expect(result).toEqual([]);
    });
  });
});
