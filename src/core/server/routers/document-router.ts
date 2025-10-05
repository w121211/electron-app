// src/core/server/routers/document-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import type { DocumentService } from "../../services/document/document-service.js";

// Document schemas
export const getDocumentSchema = z.object({
  filePath: z.string(),
  correlationId: z.string().optional(),
});

export const saveDocumentSchema = z.object({
  filePath: z.string(),
  content: z.string().optional(),
  correlationId: z.string().optional(),
});

export function createDocumentRouter(documentService: DocumentService) {
  return router({
    getDocument: publicProcedure
      .input(getDocumentSchema)
      .query(async ({ input }) => {
        return documentService.getDocument(input.filePath);
      }),

    saveDocument: publicProcedure
      .input(saveDocumentSchema)
      .mutation(async ({ input }) => {
        const document = await documentService.getDocument(input.filePath);
        return documentService.saveDocument(document, {
          content: input.content,
        });
      }),
  });
}
