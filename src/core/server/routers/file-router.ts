// src/core/server/routers/file-router.ts
import { z } from "zod";
import { openFile, getFileType, writeTextFile } from "../../utils/file-utils.js";
import { router, publicProcedure } from "../trpc-init.js";

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

export function createFileRouter() {
  return router({
    openFile: publicProcedure.input(openFileSchema).query(async ({ input }) => {
      // filePath is now expected to be an absolute path
      return openFile(input.filePath);
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
        return { success: true };
      }),
  });
}
