// src/core/server/routers/api-chat-router.ts
import { z } from "zod";
import {
  type FinishReason,
  type LanguageModelUsage,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
  type TypedToolCall,
  type UserModelMessage,
} from "ai";
import type { ChatState } from "../../services/chat/chat-session-repository.js";
import {
  ApiChatClient,
  type ApiTurnResult,
  CreateChatSessionInputSchema,
} from "../../services/chat-engine/api-chat-client.js";
import { router, publicProcedure } from "../trpc-init.js";

const userModelMessageSchema: z.ZodType<UserModelMessage> = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(z.any())]),
});

export interface SerializedStreamResult {
  text: string;
  messages: Array<ModelMessage>;
  finishReason: FinishReason;
  usage: LanguageModelUsage;
}

export interface SerializedTurnResult {
  sessionState: ChatState;
  currentTurn: number;
  toolCallsAwaitingConfirmation?: Array<TypedToolCall<ToolSet>>;
  stream?: SerializedStreamResult;
}

async function serializeStreamResult(
  streamResult: StreamTextResult<ToolSet, never> | undefined,
): Promise<SerializedStreamResult | undefined> {
  if (!streamResult) {
    return undefined;
  }

  const [text, response, finishReason, usage] = await Promise.all([
    streamResult.text,
    streamResult.response,
    streamResult.finishReason,
    streamResult.totalUsage,
  ]);

  return {
    text,
    messages: response.messages,
    finishReason,
    usage,
  } satisfies SerializedStreamResult;
}

async function serializeTurnResult(
  turnResult: ApiTurnResult,
): Promise<SerializedTurnResult> {
  const stream = await serializeStreamResult(turnResult.streamResult);
  return {
    sessionState: turnResult.state,
    currentTurn: turnResult.currentTurn,
    toolCallsAwaitingConfirmation:
      turnResult.toolCallsAwaitingConfirmation?.map((call) => ({ ...call })),
    stream,
  } satisfies SerializedTurnResult;
}

export function createApiChatRouter(chatClient: ApiChatClient) {
  return router({
    createSession: publicProcedure
      .input(CreateChatSessionInputSchema)
      .mutation(async ({ input }) => {
        const session = await chatClient.createSession(input);
        return session;
      }),

    getSession: publicProcedure
      .input(z.object({ chatSessionId: z.string() }))
      .query(async ({ input }) => {
        const session = await chatClient.getSession(input.chatSessionId);
        if (!session) {
          throw new Error(`Chat session ${input.chatSessionId} not found`);
        }
        return session;
      }),

    listSessions: publicProcedure.query(async () => {
      const sessions = await chatClient.listSessions();
      return sessions;
    }),

    sendMessage: publicProcedure
      .input(
        z.object({
          chatSessionId: z.string(),
          input: userModelMessageSchema,
          toolNames: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await chatClient.sendMessage({
          chatSessionId: input.chatSessionId,
          input: input.input,
          toolNames: input.toolNames,
        });

        const turnResult = await serializeTurnResult(result.turnResult);

        return {
          session: result.session,
          turnResult,
        };
      }),

    confirmToolCall: publicProcedure
      .input(
        z.object({
          chatSessionId: z.string(),
          toolCallId: z.string(),
          outcome: z.enum(["yes", "no", "yes_always"]),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await chatClient.confirmToolCall(
          input.chatSessionId,
          input.toolCallId,
          input.outcome,
        );

        const turnResult = await serializeTurnResult(result.turnResult);

        return {
          session: result.session,
          turnResult,
        };
      }),

    abort: publicProcedure
      .input(z.object({ chatSessionId: z.string() }))
      .mutation(async ({ input }) => {
        chatClient.abort(input.chatSessionId);
        return { success: true };
      }),

    deleteSession: publicProcedure
      .input(z.object({ chatSessionId: z.string() }))
      .mutation(async ({ input }) => {
        await chatClient.deleteSession(input.chatSessionId);
        return { success: true };
      }),
  });
}

export type ApiChatRouter = ReturnType<typeof createApiChatRouter>;
