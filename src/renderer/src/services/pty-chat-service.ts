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
import { editorViews } from "../stores/editor-views.svelte.js";
import { ptyStreamManager } from "./pty-stream-manager.js";
import { getSelectedDocContext } from "../stores/ui.svelte.js";
import { stripAnsi } from "../utils/ansi-utils.js";

const logger = new Logger({ name: "PtyChatService" });

export class PtyChatService {
  async listSessions(): Promise<ChatSessionData[]> {
    logger.info("Loading PTY chat sessions");
    const sessions = await trpcClient.ptyChat.listSessions.query();
    for (const session of sessions) {
      setChatSession(session);
    }
    return sessions;
  }

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

    // Extract and store full session in chatSessions store
    if (linked.chatSession) {
      setChatSession(linked.chatSession);
    }

    // Hydrate document and editorView to pass isDirty check
    const editorView = editorViews[scriptPath];
    const document = documents[scriptPath];
    if (editorView && document) {
      // Normalize: replace full chatSession with just the ID
      documents[scriptPath].data = {
        ...linked.promptScript,
        promptScriptLink: {
          promptScript: linked.promptScript,
          chatSessionId: linked.chatSession?.id ?? null,
          warnings: linked.warnings,
        },
      };
      editorView.unsavedContent = linked.promptScript.content;
    } else {
      throw new Error(`Editor view or document not found for ${scriptPath}`);
    }

    return linked;
  }

  async updateSession(
    sessionId: string,
    updates: {
      metadata?: Partial<ChatMetadata>;
      state?: ChatSessionData["state"];
    },
  ): Promise<ChatSessionData> {
    logger.info("Updating PTY chat session", { sessionId, updates });

    const session = await trpcClient.ptyChat.updateSession.mutate({
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

  async terminateSessionWithSnapshot(
    sessionId: string,
  ): Promise<ChatSessionData> {
    logger.info("Terminating PTY chat session with snapshot", { sessionId });

    const sessionData = await trpcClient.ptyChat.getSession.query({
      chatSessionId: sessionId,
    });

    if (sessionData.sessionType !== "pty_chat") {
      throw new Error("Session is not a PTY chat session");
    }

    const ptyInstanceId = sessionData.metadata?.external?.pty?.ptyInstanceId;
    const modelId = sessionData.metadata?.modelId;

    if (!ptyInstanceId) {
      logger.warn(
        "No PTY instance found for session, terminating without snapshot",
      );
      return this.terminateSession(sessionId);
    }

    if (!modelId) {
      throw new Error("No model ID found for session");
    }

    const ptyStream = ptyStreamManager.getStream(ptyInstanceId);
    let snapshot: string | null = null;

    if (ptyStream) {
      try {
        const rawSnapshot = ptyStream.getTerminalSnapshot();
        snapshot = stripAnsi(rawSnapshot);
      } catch (error) {
        logger.warn("Failed to capture terminal snapshot", error);
      }
    }

    if (snapshot) {
      const existingSnapshots =
        sessionData.metadata?.external?.pty?.snapshots || [];

      const updatedSession = await this.updateSession(sessionId, {
        metadata: {
          ...sessionData.metadata,
          external: {
            ...sessionData.metadata?.external,
            pty: {
              ...sessionData.metadata?.external?.pty,
              snapshots: [
                ...existingSnapshots,
                {
                  modelId,
                  snapshot,
                  timestamp: new Date(),
                },
              ],
            },
          },
        },
      });
      logger.info("Snapshot saved before termination", { sessionId });
      setChatSession(updatedSession);
    }

    return this.terminateSession(sessionId);
  }

  async restartTerminal(sessionId: string): Promise<ChatSessionData> {
    logger.info("Restarting terminal for PTY chat session", { sessionId });

    const session = await trpcClient.ptyChat.restartTerminal.mutate({
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

    const strippedSnapshot = stripAnsi(snapshot);

    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10);
    const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, "-");
    const filename = `pty-snapshot-${dateStr}-${timeStr}.txt`;
    const filepath = `tests/fixtures/${filename}`;

    await trpcClient.file.writeFile.mutate({
      filePath: filepath,
      content: strippedSnapshot,
    });

    logger.info(`PTY snapshot saved to ${filepath}`);
  }
}

export const ptyChatService = new PtyChatService();
