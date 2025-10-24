// src/core/server/routers/chat-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import { ApiChatClient } from "../../services/chat-engine/api-chat-client.js";
import { TerminalChatClient } from "../../services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../../services/external-chat/web-chat-client.js";
import type { ChatMetadata } from "../../services/chat/chat-session-repository.js";
import { getModelSurface } from "../../utils/model-utils.js";

interface CreateChatRouterDependencies {
  apiChatClient: ApiChatClient;
  terminalChatClient: TerminalChatClient;
  webChatClient: WebChatClient;
}

const modelIdSchema = z
  .string()
  .regex(/^.+\/.+$/)
  .transform((value) => value as `${string}/${string}`);

const chatMetadataInputSchema =
  z.object({}).passthrough() as z.ZodType<Partial<ChatMetadata>>;

const sessionScriptSchema = z
  .object({
    path: z.string().nullable().optional(),
    snapshot: z.string().nullable().optional(),
    hash: z.string().nullable().optional(),
    modifiedAt: z.coerce.date().nullable().optional(),
  })
  .optional();

const createChatSessionInputSchema = z.object({
  modelId: modelIdSchema,
  title: z.string().optional(),
  workingDirectory: z.string().optional(),
  metadata: chatMetadataInputSchema.optional(),
  script: sessionScriptSchema,
});

export function createChatRouter({
  apiChatClient,
  terminalChatClient,
  webChatClient,
}: CreateChatRouterDependencies) {
  return router({
    createSession: publicProcedure
      .input(createChatSessionInputSchema)
      .mutation(async ({ input }) => {
        const surface = getModelSurface(input.modelId);

        if (surface === "terminal") {
          if (!input.workingDirectory) {
            throw new Error(
              "Terminal chats require a working directory (project path).",
            );
          }

          return terminalChatClient.createSession({
            modelId: input.modelId,
            title: input.title,
            workingDirectory: input.workingDirectory,
            metadata: input.metadata,
            script: input.script,
          });
        }

        if (surface === "web") {
          return webChatClient.createSession({
            modelId: input.modelId,
            title: input.title,
            metadata: input.metadata,
            script: input.script,
          });
        }

        const metadata: Partial<ChatMetadata> = {
          ...input.metadata,
          title: input.title ?? input.metadata?.title,
          modelId: input.modelId,
          modelSurface: surface,
        };

        return apiChatClient.createSession({
          modelSurface: "api",
          metadata,
          script: input.script,
        });
      }),
  });
}

export type ChatRouter = ReturnType<typeof createChatRouter>;
