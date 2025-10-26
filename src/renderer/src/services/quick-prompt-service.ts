// src/renderer/src/services/quick-prompt-service.ts

import path from "node:path";
import type {
  ChatSessionData,
  ChatMetadata,
} from "../../../core/services/chat/chat-session-repository.js";
import { getModelSurface } from "../../../core/utils/model-utils.js";
import {
  getPromptScriptTemplatesDirectory,
  getPromptScriptSaveDirectory,
} from "../../../core/utils/user-settings-utils.js";
import { getModelMessageContentString } from "../../../core/utils/message-utils.js";
import { trpcClient } from "../lib/trpc-client.js";
import { documentClientService } from "./document-client-service.js";
import { apiChatService } from "./api-chat-service.js";
import { userSettingsService } from "./user-settings-service.js";

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
  const settings = await userSettingsService.getUserSettings();
  const scriptSaveTo = getPromptScriptSaveDirectory({
    projectPath: projectPath ?? undefined,
    settings,
  });
  const script = await documentClientService.createPromptScriptWithContent(
    scriptSaveTo,
    prompt,
  );

  // Step 2: Create chat session
  const session = await createPromptChatSession({
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

async function createPromptChatSession(params: {
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

  const metadata: Partial<ChatMetadata> | undefined =
    projectPath !== null ? { projectPath } : undefined;

  const linked = await trpcClient.promptScript.createLinkedChatSession.mutate({
    promptScriptPath: scriptPath,
    modelId,
    title: title.slice(0, 120),
    workingDirectory,
    metadata,
  });

  // documentClientService.applyPromptScriptLinkResult(scriptPath, linked);

  return linked.chatSession;
}

export async function generatePrompt(
  userInput: string,
): Promise<{ session: ChatSessionData; generatedPrompt: string }> {
  // Step 1: Get user settings to build paths
  const settings = await userSettingsService.getUserSettings();
  const tempalteDir = getPromptScriptTemplatesDirectory({ settings });
  const templatePath = path.join(tempalteDir, "generate-prompt.prompt.md");
  const saveDirectory = path.join(
    settings.project.workspaceDirectory,
    settings.promptScript.chatsFolder,
    "generate-prompt",
  );

  // Step 2: Create prompt script with template substitution (backend handles it)
  const script = await trpcClient.promptScript.create.mutate({
    directory: saveDirectory,
    templatePath,
    args: [userInput],
  });

  // Step 3: Extract modelId from the created prompt script
  const modelId = script.promptScriptParsed.metadata.modelId;
  if (!modelId) {
    throw new Error(
      `generate-prompt template not define the modelId, path: ${templatePath}`,
    );
  }
  if (getModelSurface(modelId) !== "api") {
    throw new Error(
      `generate-prompt use api chat, but got modelId: ${modelId}`,
    );
  }

  // Step 4: Create chat session
  const linked = await trpcClient.promptScript.createLinkedChatSession.mutate({
    promptScriptPath: script.absolutePath,
    modelId: modelId as `${string}/${string}`,
  });

  // Step 5: Send the first message (the substituted prompt content)
  if (!script.promptScriptParsed.prompts[0].content) {
    throw new Error(`Prompt is empty: ${script.promptScriptParsed.prompts}`);
  }

  const firstPrompt = script.promptScriptParsed.prompts[0].content;

  // Step 6: Send message and wait for AI response
  const { session } = await apiChatService.sendMessage({
    sessionId: linked.chatSession.id,
    prompt: firstPrompt,
  });

  // Step 7: Extract the generated prompt from the last message
  const lastMessage = session.messages[session.messages.length - 1];
  if (!lastMessage || lastMessage.message.role !== "assistant") {
    console.debug(session);
    throw new Error("No assistant response received");
  }
  const generatedPrompt = getModelMessageContentString(lastMessage.message);

  return { session, generatedPrompt };
}
