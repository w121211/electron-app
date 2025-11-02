// src/core/server/routers/chat-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import type { ChatMetadata } from "../../services/chat/chat-session-repository.js";
import { ChatService } from "../../services/chat/chat-service.js";

interface CreateChatRouterDependencies {
  chatService: ChatService;
}

const modelIdSchema = z
  .string()
  .regex(/^.+\/.+$/)
  .transform((value) => value as `${string}/${string}`);

const chatMetadataInputSchema =
  z.object({}).passthrough() as z.ZodType<Partial<ChatMetadata>>;

const createChatSessionInputSchema = z.object({
  modelId: modelIdSchema,
  title: z.string().optional(),
  workingDirectory: z.string().optional(),
  metadata: chatMetadataInputSchema.optional(),
  sourcePromptId: z.string().optional(),
  promptArgs: z
    .record(z.string(), z.unknown())
    .optional()
    .transform((value) => value ?? undefined),
});

export function createChatRouter({
  chatService,
}: CreateChatRouterDependencies) {
  return router({
    createSession: publicProcedure
      .input(createChatSessionInputSchema)
      .mutation(async ({ input }) => {
        const metadata: Partial<ChatMetadata> | undefined = input.metadata
          ? { ...input.metadata }
          : undefined;

        return chatService.createChat({
          modelId: input.modelId,
          title: input.title,
          sourcePromptId: input.sourcePromptId ?? null,
          promptArgs: input.promptArgs,
          metadata,
          workingDirectory: input.workingDirectory ?? null,
        });
      }),
  });
}

export type ChatRouter = ReturnType<typeof createChatRouter>;
