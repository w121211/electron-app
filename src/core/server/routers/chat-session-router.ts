// src/core/server/routers/chat-session-router.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc-init.js";
import type { ChatDraftService } from "../../services/chat-engine/chat-draft-service.js";
import type { ChatEngineClient } from "../../services/chat-engine/chat-engine-client.js";
import type { ChatSessionRepository } from "../../services/chat-engine/chat-session-repository.js";
import type { PtyChatClient } from "../../services/pty/pty-chat-client.js";
import type { ChatSessionData } from "../../services/chat-engine/chat-session-repository.js";

export function createChatSessionRouter(
  chatDraftService: ChatDraftService,
  chatClient: ChatEngineClient<any>,
  chatSessionRepository: ChatSessionRepository,
  ptyChatClient: PtyChatClient,
) {
  return router({
    getSession: publicProcedure
      .input(z.object({ absoluteFilePath: z.string() }))
      .query(async ({ input }): Promise<ChatSessionData> => {
        const sessionData = await chatSessionRepository.loadFromFile(
          input.absoluteFilePath,
        );

        if (sessionData._type === "chat_draft") {
          return await chatDraftService.getDraft(input.absoluteFilePath);
        }

        if (sessionData._type === "chat_engine") {
          const session = await chatClient.getOrLoadChatSession(
            input.absoluteFilePath,
          );
          return session.toJSON();
        }

        if (sessionData._type === "pty_chat") {
          const session = await ptyChatClient.getOrLoadPtyChat(
            input.absoluteFilePath,
          );
          return session.toJSON();
        }

        throw new Error(
          `Unsupported chat session type: ${sessionData._type}. External sessions must be handled separately.`,
        );
      }),
  });
}

export type ChatSessionRouter = ReturnType<typeof createChatSessionRouter>;
