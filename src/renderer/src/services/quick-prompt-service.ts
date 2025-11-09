// src/renderer/src/services/quick-prompt-service.ts

import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import { getModelSurface } from "../../../core/utils/model-utils.js";
import { getModelMessageContentString } from "../../../core/utils/message-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import { apiChatService } from "./api-chat-service.js";

const GENERATE_PROMPT_SLUG = "generate-prompt";

export interface LaunchChatParams {
  prompt: string;
  modelId: `${string}/${string}`;
  projectPath: string | null;
}

export async function launchChat(
  params: LaunchChatParams,
): Promise<ChatSessionData> {
  const { prompt, modelId, projectPath } = params;

  const surface = getModelSurface(modelId);
  if (surface === "terminal" && !projectPath) {
    throw new Error("Terminal models require a project folder");
  }

  // Step 1: Save prompt to database
  const savedPrompt = await trpcClient.prompt.create.mutate({
    slug: null,
    content: prompt,
    metadata: {
      modelId,
    },
  });

  // Step 2: Create chat session with prompt
  const title =
    prompt
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "New Prompt";

  const session = await trpcClient.chat.createSession.mutate({
    modelId,
    sourcePromptId: savedPrompt.id,
    title: title.slice(0, 120),
    workingDirectory:
      surface === "terminal" ? (projectPath ?? undefined) : undefined,
    metadata: projectPath !== null ? { projectPath } : undefined,
  });

  // Step 3: Send initial message for API chat
  if (surface === "api") {
    await apiChatService.sendMessage({
      sessionId: session.id,
      prompt,
    });
  }

  // Step 4: Launch surface (for terminal/web only)
  if (surface !== "api") {
    const result = await window.api.surface.launch({
      sessionId: session.id,
      modelId,
      modelSurface: surface,
      projectPath,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Failed to launch surface");
    }
  }

  return session;
}

export async function generatePrompt(
  userInput: string,
): Promise<{ session: ChatSessionData; generatedPrompt: string }> {
  // Step 1: Get prompt by slug
  const prompt = await trpcClient.prompt.findBySlug.query({
    slug: GENERATE_PROMPT_SLUG,
  });
  if (!prompt) {
    throw new Error(
      `Prompt with slug "${GENERATE_PROMPT_SLUG}" not found. Make sure the template is seeded.`,
    );
  }

  // Step 2: Validate modelId
  const modelId = prompt.metadata?.modelId;
  if (!modelId || typeof modelId !== "string") {
    throw new Error(
      `Prompt "${GENERATE_PROMPT_SLUG}" does not define a valid modelId in metadata`,
    );
  }
  if (getModelSurface(modelId as `${string}/${string}`) !== "api") {
    throw new Error(
      `Prompt "${GENERATE_PROMPT_SLUG}" must use an API model, but got modelId: ${modelId}`,
    );
  }

  // Step 3: Create chat session with prompt
  const session = await trpcClient.chat.createSession.mutate({
    modelId: modelId as `${string}/${string}`,
    sourcePromptId: prompt.id,
    promptArgs: { userInput },
    metadata: {
      title: "Generate Prompt",
      mode: "chat",
      maxTurns: 3,
    },
  });

  // Step 4: Trigger AI response for the initial message and get updated session
  const result = await trpcClient.apiChat.runSession.mutate({
    chatSessionId: session.id,
  });
  const updatedSession = result.session;

  // Step 5: Extract the generated prompt from the last assistant message
  const lastMessage =
    updatedSession.messages[updatedSession.messages.length - 1];
  if (!lastMessage || lastMessage.message.role !== "assistant") {
    console.debug(updatedSession);
    throw new Error("No assistant response received");
  }
  const generatedPrompt = getModelMessageContentString(lastMessage.message);

  return { session: updatedSession, generatedPrompt };
}
