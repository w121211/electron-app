// src/core/server/routers/pty-chat-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import { PtyChatClient } from "../../services/pty/pty-chat-client.js";
import { isTerminalModel } from "../../utils/model-utils.js";

const terminalModelIdSchema = z
  .custom<`${string}/${string}`>(
    (val) => {
      return typeof val === "string" && /^.+\/.+$/.test(val);
    },
    { message: "Model ID must be in format 'provider/model'" },
  )
  .refine((value) => isTerminalModel(value), {
    message: "Model must be a terminal PTY model",
  });

const chatMetadataUpdateSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
  external: z.object({
    pid: z.number().optional(),
    workingDirectory: z.string().optional(),
    pty: z.object({
      ptyInstanceId: z.string().optional(),
      screenshot: z.string().optional(),
      screenshotHtml: z.string().optional(),
    }).optional(),
  }).optional(),
}).partial();

export function createPtyChatRouter(ptyChatClient: PtyChatClient) {
  return router({
    createPtyChatSession: publicProcedure
      .input(
        z.object({
          targetDirectory: z.string(),
          modelId: terminalModelIdSchema,
          initialPrompt: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const session = await ptyChatClient.createPtyChatSession(
          input.targetDirectory,
          {
            modelId: input.modelId,
            initialPrompt: input.initialPrompt,
          },
        );

        return session.toJSON();
      }),

    createFromDraft: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          initialPrompt: z.string(),
          modelId: terminalModelIdSchema,
        }),
      )
      .mutation(async ({ input }) => {
        const session = await ptyChatClient.createFromDraft(
          input.absoluteFilePath,
          input.initialPrompt,
          input.modelId,
        );

        return session.toJSON();
      }),

    getPtyChatSession: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
        }),
      )
      .query(async ({ input }) => {
        const session = await ptyChatClient.getOrLoadPtyChatSession(
          input.absoluteFilePath,
        );

        return session.toJSON();
      }),

    updateMetadata: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          metadata: chatMetadataUpdateSchema,
        }),
      )
      .mutation(async ({ input }) => {
        await ptyChatClient.updatePtyChat(input.absoluteFilePath, {
          metadata: input.metadata,
        });

        const session = await ptyChatClient.getOrLoadPtyChatSession(
          input.absoluteFilePath,
        );

        return session.toJSON();
      }),
  });
}

export type PtyChatRouter = ReturnType<typeof createPtyChatRouter>;
