// src/core/server/routers/chat-session-router.ts
import { z } from "zod";
import { publicProcedure, router } from "../trpc-init.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../../services/chat/chat-session-repository.js";

interface CreateChatSessionRouterDependencies {
  chatSessionRepository: ChatSessionRepository;
}

const listInputSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

const sortSessionsByUpdatedAtDesc = (
  sessions: ChatSessionData[],
): ChatSessionData[] => {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

export function createChatSessionRouter({
  chatSessionRepository,
}: CreateChatSessionRouterDependencies) {
  return router({
    list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
      const sessions = await chatSessionRepository.list();
      const ordered = sortSessionsByUpdatedAtDesc(sessions);

      if (!input?.limit) {
        return ordered;
      }

      return ordered.slice(0, input.limit);
    }),
  });
}

export type ChatSessionRouter = ReturnType<typeof createChatSessionRouter>;
