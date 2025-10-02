// src/core/server/routers/chat-engine-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import { ChatEngineClient } from "../../services/chat-engine/chat-engine-client.js";
import { ChatDraftService } from "../../services/chat-engine/chat-draft-service.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../../services/chat/chat-session-repository.js";
import {
  isDraftSession,
  isEngineSession,
} from "../../services/chat/chat-session-repository.js";
import { isTerminalModel } from "../../utils/model-utils.js";
import { TurnResult } from "../../services/chat-engine/chat-session.js";

const ModelIdSchema = z.custom<`${string}/${string}`>(
  (val) => {
    return typeof val === "string" && /^.+\/.+$/.test(val);
  },
  { message: "Model ID must be in format 'provider/model'" },
);

const messageInputSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(z.any())]),
});

const metadataUpdateSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mode: z.enum(["chat", "agent"]).optional(),
  knowledge: z.array(z.string()).optional(),
  promptDraft: z.string().optional(),
});

async function ensureEngineSession(
  repository: ChatSessionRepository,
  absoluteFilePath: string,
): Promise<ChatSessionData> {
  const data = await repository.loadFromFile(absoluteFilePath);
  if (!isEngineSession(data)) {
    throw new Error(
      "Requested operation requires a chat engine session.",
    );
  }
  return data;
}

export function createChatEngineRouter(
  chatClient: ChatEngineClient<any>,
  chatDraftService: ChatDraftService,
  chatSessionRepository: ChatSessionRepository,
) {
  return router({
    startFromDraft: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          modelId: ModelIdSchema.refine((value) => !isTerminalModel(value), {
            message: "Model must be a chat engine model",
          }),
          message: messageInputSchema,
        }),
      )
      .mutation(
        async ({ input }): Promise<{
          turnResult: TurnResult;
          updatedChatSession: ChatSessionData;
        }> => {
          if (isTerminalModel(input.modelId)) {
            throw new Error(
              "Terminal models must be handled by the PTY chat router.",
            );
          }

          const draft = await chatDraftService.getDraft(input.absoluteFilePath);
          if (!isDraftSession(draft)) {
            throw new Error("Session is not a draft");
          }

          const session = await chatClient.activateDraft(
            input.absoluteFilePath,
            input.modelId,
          );

          const result = await chatClient.sendMessage(
            session.absoluteFilePath,
            session.id,
            input.message,
          );

          return {
            turnResult: result.turnResult,
            updatedChatSession: result.updatedChatSession.toJSON(),
          };
        },
      ),

    sendMessage: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          chatSessionId: z.string(),
          message: messageInputSchema,
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          turnResult: TurnResult;
          updatedChatSession: ChatSessionData;
        }> => {
          await ensureEngineSession(
            chatSessionRepository,
            input.absoluteFilePath,
          );

          const result = await chatClient.sendMessage(
            input.absoluteFilePath,
            input.chatSessionId,
            input.message,
          );

          return {
            turnResult: result.turnResult,
            updatedChatSession: result.updatedChatSession.toJSON(),
          };
        },
      ),

    confirmToolCall: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          chatSessionId: z.string(),
          toolCallId: z.string(),
          outcome: z.enum(["yes", "no", "yes_always"]),
        }),
      )
      .mutation(
        async ({
          input,
        }): Promise<{
          turnResult: TurnResult;
          updatedChatSession: ChatSessionData;
        }> => {
          await ensureEngineSession(
            chatSessionRepository,
            input.absoluteFilePath,
          );

          const result = await chatClient.confirmToolCall(
            input.absoluteFilePath,
            input.chatSessionId,
            input.toolCallId,
            input.outcome,
          );

          return {
            turnResult: result.turnResult,
            updatedChatSession: result.updatedChatSession.toJSON(),
          };
        },
      ),

    abortChat: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          chatSessionId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        await ensureEngineSession(
          chatSessionRepository,
          input.absoluteFilePath,
        );
        await chatClient.abortChat(input.absoluteFilePath, input.chatSessionId);
        return { success: true };
      }),

    updateSession: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          updates: z
            .object({
              metadata: metadataUpdateSchema.optional(),
              maxTurns: z.number().optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await ensureEngineSession(
          chatSessionRepository,
          input.absoluteFilePath,
        );
        await chatClient.updateChat(
          input.absoluteFilePath,
          input.updates || {},
        );
        const session = await chatClient.getOrLoadChatSession(
          input.absoluteFilePath,
        );
        return session.toJSON();
      }),

    deleteSession: publicProcedure
      .input(z.object({ absoluteFilePath: z.string() }))
      .mutation(async ({ input }) => {
        await ensureEngineSession(
          chatSessionRepository,
          input.absoluteFilePath,
        );
        await chatClient.deleteChat(input.absoluteFilePath);
        return { success: true };
      }),

    getSession: publicProcedure
      .input(z.object({ absoluteFilePath: z.string() }))
      .query(async ({ input }) => {
        await ensureEngineSession(
          chatSessionRepository,
          input.absoluteFilePath,
        );
        const session = await chatClient.getOrLoadChatSession(
          input.absoluteFilePath,
        );
        return session.toJSON();
      }),

    rerunSession: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          chatSessionId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        await ensureEngineSession(
          chatSessionRepository,
          input.absoluteFilePath,
        );
        return await chatClient.rerunChat(
          input.absoluteFilePath,
          input.chatSessionId,
        );
      }),
  });
}

export type ChatEngineRouter = ReturnType<typeof createChatEngineRouter>;
