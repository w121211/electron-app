// src/core/server/routers/chat-router.ts
import { z } from "zod";
import {
  ChatService,
  type CreateChatParams,
} from "../../services/chat/chat-service.js";
import { router, publicProcedure } from "../trpc-init.js";
import type { ModelMessage } from "ai";

interface CreateChatRouterDependencies {
  chatService: ChatService;
}

const modelIdSchema = z
  .string()
  .regex(/^.+:.+$/)
  .transform((value) => value as `${string}:${string}`);

const modelMessageSchema: z.ZodType<ModelMessage> = z.any();

const createChatParamsSchema: z.ZodType<CreateChatParams> = z.object({
  modelId: modelIdSchema,
  title: z.string().optional(),
  sourcePromptId: z.string().nullable().optional(),
  promptArgs: z.record(z.string(), z.unknown()).optional(),
  initialMessages: z.array(modelMessageSchema).optional(),
  metadata: z.looseObject({}).optional(),
  workingDirectory: z.string().nullable().optional(),
});

export function createChatRouter({
  chatService,
}: CreateChatRouterDependencies) {
  return router({
    createSession: publicProcedure
      .input(createChatParamsSchema)
      .mutation(async ({ input }) => {
        return chatService.createChat(input);
      }),
  });
}

export type ChatRouter = ReturnType<typeof createChatRouter>;
