// src/core/server/routers/chat-client-router.ts

import { z } from "zod";
import { ChatClient } from "../../services/chat-engine/chat-client.js";
import type { IEventBus } from "../../event-bus.js";
import type { ChatSessionData } from "../../services/chat-engine/chat-session-repository.js";
import type { CreateChatSessionConfig } from "../../services/chat-engine/chat-client.js";
import type { TaskService } from "../../services/task-service.js";
import type { ProjectFolderService } from "../../services/project-folder-service.js";
import type { UserSettingsService } from "../../services/user-settings-service.js";
import type { ToolRegistry } from "../../services/tool-call/tool-registry.js";
import type { ChatSessionRepository } from "../../services/chat-engine/chat-session-repository.js";
import { TurnResult } from "../../services/chat-engine/chat-session.js";
import { router, publicProcedure } from "../trpc-init.js";
import { isTerminalModel } from "../../utils/model-utils.js";
import { PtyChatClient } from "../../services/pty/pty-chat-client.js";

const createChatSessionConfigSchema: z.ZodType<CreateChatSessionConfig> =
  z.object({
    mode: z.enum(["chat", "agent"]).default("chat"),
    knowledge: z.array(z.string()).optional(),
    promptDraft: z.string().optional(),
    newTask: z.boolean().optional(),
    modelId: z
      .custom<`${string}/${string}`>(
        (val) => {
          return typeof val === "string" && /^.+\/.+$/.test(val);
        },
        { message: "Model ID must be in format 'provider/model'" },
      )
      .optional(),
  });

const createChatSessionFromTemplateSchema = z.object({
  templatePath: z.string(),
  targetDirectory: z.string(),
  args: z.array(z.string()),
  config: createChatSessionConfigSchema.optional(),
});

const sendMessageSchema = z.object({
  absoluteFilePath: z.string(),
  chatSessionId: z.string(),
  message: z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(z.any())]),
  }),
  modelId: z
    .custom<`${string}/${string}`>(
      (val) => {
        return typeof val === "string" && /^.+\/.+$/.test(val);
      },
      { message: "Model ID must be in format 'provider/model'" },
    )
    .optional(),
});

export function createChatClientRouter(
  eventBus: IEventBus,
  taskService: TaskService,
  projectFolderService: ProjectFolderService,
  userSettingsService: UserSettingsService,
  toolRegistry: ToolRegistry,
  chatSessionRepository: ChatSessionRepository,
  ptyChatClient: PtyChatClient,
) {
  const chatClient = new ChatClient(
    eventBus,
    chatSessionRepository,
    taskService,
    projectFolderService,
    userSettingsService,
    toolRegistry,
  );

  return router({
    createNewChatSession: publicProcedure
      .input(
        z.object({
          targetDirectory: z.string(),
          config: createChatSessionConfigSchema.optional(),
        }),
      )
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        const modelId = input.config?.modelId;

        if (modelId && isTerminalModel(modelId)) {
          const session = await ptyChatClient.createPtyChatSession(
            input.targetDirectory,
            {
              modelId,
              initialPrompt: input.config?.promptDraft,
            },
          );
          return session.toJSON();
        }

        const result = await chatClient.createChatSession(
          input.targetDirectory,
          input.config,
        );
        return result.toJSON();
      }),

    createChatSessionFromTemplate: publicProcedure
      .input(createChatSessionFromTemplateSchema)
      .mutation(async ({ input }): Promise<ChatSessionData> => {
        const modelId = input.config?.modelId;

        if (modelId && isTerminalModel(modelId)) {
          const session = await ptyChatClient.createPtyChatSession(
            input.targetDirectory,
            {
              modelId,
              initialPrompt: input.config?.promptDraft,
            },
          );
          return session.toJSON();
        }

        const result = await chatClient.createChatSessionFromTemplate(
          input.templatePath,
          input.targetDirectory,
          input.args,
          input.config,
        );
        return result.toJSON();
      }),

    sendMessage: publicProcedure.input(sendMessageSchema).mutation(
      async ({
        input,
      }): Promise<{
        turnResult: TurnResult;
        updatedChatSession: ChatSessionData;
      }> => {
        // Get current chat session to check the model
        const session = await chatClient.getOrLoadChatSession(
          input.absoluteFilePath,
        );

        // Only allow modelId to be set on the first message (when session has no messages)
        if (input.modelId) {
          if (session.messages.length > 0) {
            throw new Error(
              "Model ID can only be set on the first message of a chat session",
            );
          }
          // Update the session's modelId for the first message
          await chatClient.updateChat(input.absoluteFilePath, {
            modelId: input.modelId,
          });
        }

        // Normal AI chat processing
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
          // Load session data to determine type
          const sessionData = await chatSessionRepository.loadFromFile(
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
        // Load session data to determine type
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "pty_chat") {
          // PTY sessions don't support abort - they are controlled via terminal
          throw new Error("Abort not supported for PTY chat sessions");
        } else {
          await chatClient.abortChat(
            input.absoluteFilePath,
            input.chatSessionId,
          );
        }
        return { success: true };
      }),

    // TODO: Implement getAvailableModels method in ChatClient
    // getAvailableModels: publicProcedure.query(async () => {
    //   const models = await chatClient.getAvailableModels();
    //   return models;
    // }),

    updateChat: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          updates: z
            .object({
              metadata: z.any().optional(),
              maxTurns: z.number().optional(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ input }) => {
        // Load session data to determine type
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "pty_chat") {
          // PTY chat sessions don't support updates
          throw new Error("Updates not supported for PTY chat sessions");
        } else {
          await chatClient.updateChat(
            input.absoluteFilePath,
            input.updates || {},
          );
        }
        return { success: true };
      }),

    deleteChat: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        // Load session data to determine type
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "pty_chat") {
          await ptyChatClient.deleteSession(input.absoluteFilePath);
        } else {
          await chatClient.deleteChat(input.absoluteFilePath);
        }
        return { success: true };
      }),

    getChatSession: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
        }),
      )
      .query(async ({ input }) => {
        // Load session data to determine type
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "pty_chat") {
          const session = await ptyChatClient.getOrLoadPtyChatSession(
            input.absoluteFilePath,
          );
          return session.toJSON();
        } else {
          // Use regular chat client
          const session = await chatClient.getOrLoadChatSession(
            input.absoluteFilePath,
          );
          return session.toJSON();
        }
      }),

    rerunChat: publicProcedure
      .input(
        z.object({
          absoluteFilePath: z.string(),
          chatSessionId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        // Load session data to determine type
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "pty_chat") {
          throw new Error("Rerun not supported for PTY chat sessions");
        } else {
          const result = await chatClient.rerunChat(
            input.absoluteFilePath,
            input.chatSessionId,
          );
          return result;
        }
      }),
  });
}

export type ChatClientRouter = ReturnType<typeof createChatClientRouter>;
