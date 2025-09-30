// src/core/server/routers/prompt-doc-router.ts
import { z } from "zod";
import { PromptDocService } from "../../services/prompt-doc/prompt-doc-service.js";
import { router, publicProcedure } from "../trpc-init.js";

const conversationEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("user"),
    content: z.string(),
  }),
  z.object({
    kind: z.literal("model"),
    referenceId: z.string(),
  }),
  z.object({
    kind: z.literal("tool_call"),
    referenceId: z.string(),
  }),
  z.object({
    kind: z.literal("tool_result"),
    referenceId: z.string(),
  }),
]);

const createPromptDocSchema = z.object({
  directory: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  modelId: z.string().min(1),
  tags: z.array(z.string()).optional(),
  context: z.string().optional(),
  initialConversation: z.array(conversationEntrySchema).optional(),
  initialLatestPrompt: z.string().optional(),
  fileName: z.string().optional(),
});

const absoluteFilePathSchema = z.object({
  absoluteFilePath: z.string().min(1),
});

const updateLatestPromptSchema = z.object({
  absoluteFilePath: z.string().min(1),
  latestPrompt: z.string(),
});

const appendReferenceSchema = z.object({
  absoluteFilePath: z.string().min(1),
  referenceId: z.string().min(1),
});

const updateMetadataSchema = z.object({
  absoluteFilePath: z.string().min(1),
  title: z.string().optional(),
  modelId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

const updateContextSchema = z.object({
  absoluteFilePath: z.string().min(1),
  context: z.string().optional(),
});

function toDate(value?: string | Date): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed;
}

export function createPromptDocRouter(promptDocService: PromptDocService) {
  return router({
    create: publicProcedure
      .input(createPromptDocSchema)
      .mutation(async ({ input }) => {
        return promptDocService.createPromptDoc({
          directory: input.directory,
          id: input.id,
          title: input.title,
          modelId: input.modelId,
          tags: input.tags,
          context: input.context,
          initialConversation: input.initialConversation,
          initialLatestPrompt: input.initialLatestPrompt,
          fileName: input.fileName,
        });
      }),

    get: publicProcedure
      .input(absoluteFilePathSchema)
      .query(async ({ input }) => {
        return promptDocService.loadPromptDoc(input.absoluteFilePath);
      }),

    updateLatestPrompt: publicProcedure
      .input(updateLatestPromptSchema)
      .mutation(async ({ input }) => {
        return promptDocService.updateLatestPrompt({
          absoluteFilePath: input.absoluteFilePath,
          latestPrompt: input.latestPrompt,
        });
      }),

    commitLatestPrompt: publicProcedure
      .input(absoluteFilePathSchema)
      .mutation(async ({ input }) => {
        return promptDocService.commitLatestPrompt(input.absoluteFilePath);
      }),

    appendModelReference: publicProcedure
      .input(appendReferenceSchema)
      .mutation(async ({ input }) => {
        return promptDocService.appendModelReference({
          absoluteFilePath: input.absoluteFilePath,
          referenceId: input.referenceId,
        });
      }),

    appendToolCallReference: publicProcedure
      .input(appendReferenceSchema)
      .mutation(async ({ input }) => {
        return promptDocService.appendToolCallReference({
          absoluteFilePath: input.absoluteFilePath,
          referenceId: input.referenceId,
        });
      }),

    appendToolResultReference: publicProcedure
      .input(appendReferenceSchema)
      .mutation(async ({ input }) => {
        return promptDocService.appendToolResultReference({
          absoluteFilePath: input.absoluteFilePath,
          referenceId: input.referenceId,
        });
      }),

    updateMetadata: publicProcedure
      .input(updateMetadataSchema)
      .mutation(async ({ input }) => {
        return promptDocService.updateMetadata({
          absoluteFilePath: input.absoluteFilePath,
          title: input.title,
          modelId: input.modelId,
          tags: input.tags,
          updatedAt: toDate(input.updatedAt),
        });
      }),

    updateContext: publicProcedure
      .input(updateContextSchema)
      .mutation(async ({ input }) => {
        return promptDocService.updateContext({
          absoluteFilePath: input.absoluteFilePath,
          context: input.context,
        });
      }),
  });
}
