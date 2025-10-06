// src/renderer/src/services/api-chat-service.ts

import { Logger } from "tslog";
import type { UserModelMessage } from "ai";
import { setChatSession } from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";

const logger = new Logger({ name: "ApiChatService" });

export class ApiChatService {
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
