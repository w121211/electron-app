// src/renderer/src/services/quick-prompt-service.ts

import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import { getModelSurface } from "../../../core/utils/model-utils.js";
import { getPromptScriptSaveDirectory } from "../../../core/utils/prompt-script-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import { setChatSession } from "../stores/chat.svelte.js";
import { documentClientService } from "./document-client-service.js";
import { apiChatService } from "./api-chat-service.js";
import { userSettingsState } from "../stores/user-settings-store.svelte.js";

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

  // Step 1: Create prompt script
  const scriptSaveTo = getPromptScriptSaveDirectory({
    projectPath: projectPath ?? undefined,
    settings: userSettingsState.settings,
  });
  const script = await documentClientService.createPromptScriptWithContent(
    scriptSaveTo,
    prompt,
  );

  // Step 2: Create chat session
  const session = await createChatSession({
    prompt,
    modelId,
    scriptPath: script.absolutePath,
    projectPath,
  });

  // Step 3: Send initial message for API chat
  if (session.modelSurface === "api") {
    await apiChatService.sendMessage({
      sessionId: session.id,
      prompt,
    });
  }

  // Step 4: Launch surface (for terminal/web only)
  const sessionSurface = session.metadata?.modelSurface ?? surface;
  if (sessionSurface !== "api") {
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

async function createChatSession(params: {
  prompt: string;
  modelId: `${string}/${string}`;
  scriptPath: string;
  projectPath: string | null;
}): Promise<ChatSessionData> {
  const { prompt, modelId, scriptPath, projectPath } = params;

  // Extract title from first non-empty line
  const title =
    prompt
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "New Prompt";

  // Determine surface and working directory
  const surface = getModelSurface(modelId);
  const workingDirectory =
    surface === "terminal" ? (projectPath ?? undefined) : undefined;

  // Create session
  const session = await trpcClient.chat.createSession.mutate({
    modelId,
    title: title.slice(0, 120),
    workingDirectory,
    script: {
      path: scriptPath,
      snapshot: prompt,
    },
  });

  // Link script to session
  await documentClientService.linkPromptScriptToChatSession(
    scriptPath,
    session.id,
  );

  // Update store
  setChatSession(session);

  return session;
}
