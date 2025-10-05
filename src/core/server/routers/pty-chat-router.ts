// src/core/server/routers/pty-chat-router.ts
import { z } from "zod";
import type {
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
} from "../../services/chat/chat-session-repository.js";
import { PtyChatClient } from "../../services/pty/pty-chat-client.js";
import { router, publicProcedure } from "../trpc-init.js";

const metadataSchema: z.ZodType<Partial<ChatMetadata>> = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
  external: z
    .object({
      mode: z.enum(["terminal", "pty"]).optional(),
      pid: z.number().optional(),
      workingDirectory: z.string().optional(),
      pty: z
        .object({
          initialCommand: z.string().optional(),
          ptyInstanceId: z.string().optional(),
          snapshot: z.string().optional(),
          snapshotHtml: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  modelId: z
    .string()
    .regex(/^.+\/.+$/)
    .transform((value) => value as `${string}/${string}`)
    .optional(),
  currentTurn: z.number().optional(),
  maxTurns: z.number().optional(),
});

const modelIdSchema = z
  .string()
  .regex(/^.+\/.+$/)
  .transform((value) => value as `${string}/${string}`);

export function createPtyChatRouter(
  client: PtyChatClient,
  repository: ChatSessionRepository,
) {
  return router({
    createSession: publicProcedure
      .input(
        z.object({
          workingDirectory: z.string(),
          modelId: modelIdSchema,
          initialPrompt: z.string().optional(),
          metadata: metadataSchema.optional(),
        }),
      )
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        const session = await client.createSession({
          workingDirectory: input.workingDirectory,
          modelId: input.modelId,
          initialPrompt: input.initialPrompt,
          metadata: input.metadata,
        });
        return session;
      }),

    // sendInput: publicProcedure
    //   .input(
    //     z.object({
    //       chatSessionId: z.string(),
    //       data: z.string(),
    //     }),
    //   )
    //   .mutation(async ({ input }) => {
    //     await client.sendInput(input.chatSessionId, input.data);
    //     return { success: true };
    //   }),

    updateMessagesFromSnapshot: publicProcedure
      .input(
        z.object({
          chatSessionId: z.string(),
          snapshot: z.string(),
        }),
      )
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        const session = await client.updateMessagesFromSnapshot(
          input.chatSessionId,
          input.snapshot,
        );
        return session;
      }),

    terminateSession: publicProcedure
      .input(z.object({ chatSessionId: z.string() }))
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        const session = await client.terminateChatSession(input.chatSessionId);
        return session;
      }),

    getSession: publicProcedure
      .input(z.object({ chatSessionId: z.string() }))
      .query(async ({ input }) => {
        const session = await repository.getById(input.chatSessionId);
        if (!session || session.sessionType !== "pty_chat") {
          throw new Error(`PTY chat session ${input.chatSessionId} not found`);
        }
        return session;
      }),

    listSessions: publicProcedure.query(async () => {
      const sessions = await repository.list();
      return sessions.filter((session) => session.sessionType === "pty_chat");
    }),
  });
}

export type PtyChatRouter = ReturnType<typeof createPtyChatRouter>;
