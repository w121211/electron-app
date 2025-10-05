// src/renderer/src/services/chat-service.ts

import { Logger } from "tslog";
import type { UserModelMessage } from "ai";
import type {
  ChatSessionData,
  ChatMetadata,
} from "../../../core/services/chat/chat-session-repository.js";
import type { PromptScriptLinkResult } from "../../../core/services/prompt-script/prompt-script-repository.js";
import {
  setChatSession,
  setAvailableModels,
  setSelectedModel,
} from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import { setPreference } from "../lib/local-storage.js";
import { documents } from "../stores/documents.svelte.js";
import type { DocumentFileWithPromptScript } from "../../../core/services/document/document-service.js";
import { editorViews } from "../stores/editor-views.svelte.js";
import { ptyStreamManager } from "./pty-stream-manager.js";
import { getSelectedDocContext, ui } from "../stores/ui.svelte.js";

const logger = new Logger({ name: "ChatService" });

export class ChatService {
  async createPtyChatSession(
    workingDirectory: string,
    modelId: `${string}/${string}`,
    initialPrompt?: string,
    metadata?: Partial<ChatMetadata>,
  ): Promise<ChatSessionData> {
    const session = await trpcClient.ptyChat.createSession.mutate({
      workingDirectory,
      modelId,
      initialPrompt,
      metadata,
    });

    setChatSession(session);

    return session;
  }

  async createLinkedPtyChatSession({
    scriptPath,
    workingDirectory,
    modelId,
    initialPrompt,
    metadata,
  }: {
    scriptPath: string;
    workingDirectory: string;
    modelId: `${string}/${string}`;
    initialPrompt: string;
    metadata?: Partial<ChatMetadata>;
  }): Promise<PromptScriptLinkResult> {
    const session = await this.createPtyChatSession(
      workingDirectory,
      modelId,
      initialPrompt,
      metadata,
    );
    const linked = await trpcClient.promptScript.linkChatSession.mutate({
      promptScriptPath: scriptPath,
      chatSessionId: session.id,
    });

    setChatSession(linked.chatSession);

    // Hydrate document and editorView to pass isDirty check
    const editorView = editorViews[scriptPath];
    const document = documents[scriptPath];
    if (editorView && document) {
      const docFile: DocumentFileWithPromptScript = {
        ...linked.promptScript,
        promptScriptLink: linked,
      };
      documents[scriptPath].data = docFile;
      editorView.unsavedContent = docFile.content;
    } else {
      throw new Error(`Editor view or document not found for ${scriptPath}`);
    }

    // Hack: Update store through open the prompt script (without focus)
    // await documentClientService.openDocument(scriptPath, { focus: false });

    return linked;
  }

  async sendPrompt({
    sessionId,
    prompt,
    toolNames,
  }: {
    sessionId: string;
    prompt: string;
    toolNames?: string[];
  }) {
    logger.info("Sending prompt", { sessionId });

    const input: UserModelMessage = { role: "user", content: prompt };
    const result = await trpcClient.apiChat.sendMessage.mutate({
      chatSessionId: sessionId,
      input,
      toolNames,
    });

    setChatSession(result.session);

    return result;
  }

  async terminatePtyChatSession(sessionId: string): Promise<ChatSessionData> {
    logger.info("Terminating PTY chat session", { sessionId });

    const session = await trpcClient.ptyChat.terminateSession.mutate({
      chatSessionId: sessionId,
    });
    setChatSession(session);

    return session;
  }

  // private async safeGetSessionById(
  //   sessionId: string,
  // ): Promise<ChatSessionData | null> {
  //   try {
  //     const session = await trpcClient.apiChat.getSession.query({
  //       chatSessionId: sessionId,
  //     });
  //     return session;
  //   } catch (error) {
  //     logger.warn("Failed to resolve session by id", { sessionId, error });
  //     return null;
  //   }
  // }

  async rerunChat(
    _absoluteFilePath: string,
    _chatSessionId: string,
  ): Promise<never> {
    throw new Error(
      "rerunChat via chat files is not supported in the prompt-script workflow.",
    );
  }

  // handleChatEvent(event: ChatUpdatedEvent): void {
  //   const hydration: ChatHydrationStatus =
  //     event.updateType === "AI_RESPONSE_STARTED" ||
  //     event.updateType === "AI_RESPONSE_STREAMING"
  //       ? "streaming"
  //       : "idle";
  //   void this.hydrateSession(event.chat, { hydration }).catch((error) => {
  //     this.logger.error("Failed to hydrate chat session from event", {
  //       chatId: event.chatId,
  //       updateType: event.updateType,
  //       error,
  //     });
  //   });
  // }

  async savePtySnapshotToFixtures(): Promise<void> {
    const docContext = getSelectedDocContext();
    const session = docContext?.chatSessionState;

    if (!session) {
      throw new Error("No active chat session");
    }

    if (session.data.sessionType !== "pty_chat") {
      throw new Error("Current session is not a PTY chat session");
    }

    const ptyInstanceId = session.data.metadata?.external?.pty?.ptyInstanceId;
    if (!ptyInstanceId) {
      throw new Error("No PTY instance found for current session");
    }

    const ptyStream = ptyStreamManager.getStream(ptyInstanceId);
    if (!ptyStream) {
      throw new Error("PTY stream not found");
    }

    const snapshot = ptyStream.getTerminalSnapshot();
    if (!snapshot) {
      throw new Error("No terminal snapshot available");
    }

    const modelName =
      session.data.metadata?.modelId?.split("/").pop() || "unknown";
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, "-");
    const filename = `pty-snapshot-${modelName}-${dateStr}-${timeStr}.txt`;
    const filepath = `tests/fixtures/${filename}`;

    await trpcClient.file.writeFile.mutate({
      filePath: filepath,
      content: snapshot,
    });

    logger.info(`PTY snapshot saved to ${filepath}`);
  }

  // Chat global settings

  selectModel(modelId: `${string}/${string}`): void {
    setSelectedModel(modelId);
    setPreference("selectedModel", modelId);
  }

  async hydrateAvailableModels(): Promise<void> {
    const response = await trpcClient.model.getAvailableModels.query();
    setAvailableModels(response);
    const totalModels =
      Object.keys(response.external).length +
      Object.keys(response.internal).length;
    logger.info(`Loaded ${totalModels} available models.`);
  }

  togglePromptEditor = (): void => {
    throw new Error(
      "Prompt editor toggling is owned by the document workflow now.",
    );
  };
}

export const chatService = new ChatService();
