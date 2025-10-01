// src/core/server/routers/api-chat-router.ts
import { z } from "zod";
import {
  modelMessageSchema,
  type FinishReason,
  type LanguageModelUsage,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
  type TypedToolCall,
  type UserModelMessage,
} from "ai";
import type {
  ChatMessage,
  ChatMessageMetadata,
  ChatMetadata,
  ChatSessionStatus,
  ChatSessionType,
} from "../../services/chat-engine/chat-session-repository.js";
import {
  ApiChatClient,
  type ApiTurnResult,
  type CreateChatSessionInput,
} from "../../services/chat-engine/api-chat-client.js";
import { router, publicProcedure } from "../trpc-init.js";

const chatSessionTypeSchema: z.ZodType<ChatSessionType> = z.enum([
  "chat_engine",
  "chat_draft",
  "external_chat",
  "pty_chat",
]);

const chatSessionStatusSchema: z.ZodType<ChatSessionStatus> = z.enum([
  "idle",
  "processing",
  "scheduled",
  "waiting_confirmation",
  "max_turns_reached",
  "external_active",
  "external_terminated",
]);

const chatMessageMetadataSchema: z.ZodType<ChatMessageMetadata> = z.object({
  timestamp: z.coerce.date(),
  subtaskId: z.string().optional(),
  taskId: z.string().optional(),
  fileReferences: z
    .array(
      z.object({
        path: z.string(),
        md5: z.string(),
      }),
    )
    .optional(),
});

const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: z.string(),
  message: modelMessageSchema,
  metadata: chatMessageMetadataSchema,
});

const chatMetadataSchema: z.ZodType<ChatMetadata> = z.object({
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
  toolSet: z.any().optional(),
  toolCallsAwaitingConfirmation: z.array(z.any()).optional(),
  toolCallConfirmations: z
    .array(
      z.object({
        toolCallId: z.string(),
        outcome: z.enum(["yes", "yes_always", "no"]),
        timestamp: z.coerce.date(),
      }),
    )
    .optional(),
  toolAlwaysAllowRules: z
    .array(
      z.object({
        toolName: z.string(),
        sourceConfirmation: z.object({
          toolCallId: z.string(),
          outcome: z.enum(["yes", "yes_always", "no"]),
          timestamp: z.coerce.date(),
        }),
      }),
    )
    .optional(),
});

const createChatSessionInputSchema: z.ZodType<CreateChatSessionInput> = z
  .object({
    sessionType: chatSessionTypeSchema,
    metadata: chatMetadataSchema.optional(),
    messages: z.array(chatMessageSchema).optional(),
    status: chatSessionStatusSchema.optional(),
    script: z
      .object({
        path: z.string().nullable().optional(),
        modifiedAt: z.coerce.date().nullable().optional(),
        hash: z.string().nullable().optional(),
        snapshot: z.string().nullable().optional(),
      })
      .optional(),
  })
  .transform((value) => ({
    ...value,
    metadata: value.metadata ?? {},
    messages: value.messages ?? [],
  }));

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
  sessionStatus: ChatSessionStatus;
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
    sessionStatus: turnResult.sessionStatus,
    currentTurn: turnResult.currentTurn,
    toolCallsAwaitingConfirmation:
      turnResult.toolCallsAwaitingConfirmation?.map((call) => ({ ...call })),
    stream,
  } satisfies SerializedTurnResult;
}

export function createApiChatRouter(chatClient: ApiChatClient) {
  return router({
    createSession: publicProcedure
      .input(createChatSessionInputSchema)
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
