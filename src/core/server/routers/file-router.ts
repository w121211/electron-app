// src/core/server/routers/file-router.ts
import { z } from "zod";
import { getFileType, writeTextFile } from "../../utils/file-utils.js";
import { router, publicProcedure } from "../trpc-init.js";
import type { DocumentService } from "../../services/document/document-service.js";

// File schemas
export const openFileSchema = z.object({
  filePath: z.string(), // This is now expected to be an absolute path
  correlationId: z.string().optional(),
});

export const writeFileSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  correlationId: z.string().optional(),
});

export function createFileRouter(documentService: DocumentService) {
  return router({
    openFile: publicProcedure.input(openFileSchema).query(async ({ input }) => {
      return documentService.getDocument(input.filePath);
    }),

    getFileType: publicProcedure
      .input(openFileSchema)
      .query(async ({ input }) => {
        return getFileType(input.filePath);
      }),

    writeFile: publicProcedure
      .input(writeFileSchema)
      .mutation(async ({ input }) => {
        await writeTextFile(input.filePath, input.content);
        // After writing, return the full, updated document state
        return documentService.getDocument(input.filePath);
      }),
  });
}
