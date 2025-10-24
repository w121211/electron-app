// src/renderer/src/services/api-chat-service.ts

import { Logger } from "tslog";
import type { UserModelMessage } from "ai";
import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import type { CreateChatSessionInput } from "../../../core/services/chat-engine/api-chat-client.js";
import { setChatSession } from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import { userSettingsState } from "../stores/user-settings-store.svelte.js";

const logger = new Logger({ name: "ApiChatService" });

export class ApiChatService {
  async listSessions(): Promise<ChatSessionData[]> {
    logger.info("Loading API chat sessions");
    const sessions = await trpcClient.apiChat.listSessions.query();
    for (const session of sessions) {
      setChatSession(session);
    }
    return sessions;
  }

  async createSession(
    input: CreateChatSessionInput,
  ): Promise<ChatSessionData> {
    logger.info("Creating API chat session", {
      modelSurface: input.modelSurface,
    });

    const projectPath = userSettingsState.settings.project.directories[0]?.path;
    const sessionInput: CreateChatSessionInput = {
      ...input,
      metadata: {
        ...input.metadata,
        projectPath,
      },
    };

    const session = await trpcClient.apiChat.createSession.mutate(sessionInput);
    setChatSession(session);
    return session;
  }

  async abortSession(chatSessionId: string): Promise<void> {
    logger.info("Aborting chat session", { chatSessionId });
    await trpcClient.apiChat.abort.mutate({ chatSessionId });
  }

  async sendMessage({
    sessionId,
    prompt,
    toolNames,
  }: {
    sessionId: string;
    prompt: string;
    toolNames?: string[];
  }) {
    logger.info("Sending message", { sessionId });

    const input: UserModelMessage = { role: "user", content: prompt };
    const result = await trpcClient.apiChat.sendMessage.mutate({
      chatSessionId: sessionId,
      input,
      toolNames,
    });

    setChatSession(result.session);

    return result;
  }
}

export const apiChatService = new ApiChatService();
