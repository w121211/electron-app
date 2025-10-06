// src/renderer/src/services/pty-chat-service.ts

import { Logger } from "tslog";
import type {
  ChatSessionData,
  ChatMetadata,
} from "../../../core/services/chat/chat-session-repository.js";
import type { PromptScriptLinkResult } from "../../../core/services/prompt-script/prompt-script-repository.js";
import { setChatSession } from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import { documents } from "../stores/documents.svelte.js";
import type { DocumentFileWithPromptScript } from "../../../core/services/document/document-service.js";
import { editorViews } from "../stores/editor-views.svelte.js";
import { ptyStreamManager } from "./pty-stream-manager.js";
import { getSelectedDocContext } from "../stores/ui.svelte.js";

const logger = new Logger({ name: "PtyChatService" });

export class PtyChatService {
  async createSession(
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

  async createLinkedSession({
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
    const session = await this.createSession(
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

    return linked;
  }

  async updateSession(
    sessionId: string,
    updates: {
      metadata?: Partial<ChatMetadata>;
      sessionStatus?: ChatSessionData["sessionStatus"];
    },
  ): Promise<ChatSessionData> {
    logger.info("Updating PTY chat session", { sessionId, updates });

    const session = await trpcClient.ptyChat.updateChatSession.mutate({
      chatSessionId: sessionId,
      updates,
    });
    setChatSession(session);

    return session;
  }

  async terminateSession(sessionId: string): Promise<ChatSessionData> {
    logger.info("Terminating PTY chat session", { sessionId });

    const session = await trpcClient.ptyChat.terminateSession.mutate({
      chatSessionId: sessionId,
    });
    setChatSession(session);

    return session;
  }

  async saveSnapshotToFixtures(): Promise<void> {
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
}

export const ptyChatService = new PtyChatService();
