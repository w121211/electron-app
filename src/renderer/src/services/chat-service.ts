// src/renderer/src/services/chat-service.ts

import { Logger } from "tslog";
import type {
  ChatSessionData,
  ChatSessionStatus,
} from "../../../core/services/chat-engine/chat-session-repository.js";
import type { PromptScriptMetadata } from "../../../core/services/prompt-script/prompt-script-parser.js";
import type { ChatUpdatedEvent } from "../../../core/services/chat-engine/events.js";
import {
  chatSessions,
  sessionLinks,
  type ChatHydrationStatus,
  type ChatSessionState,
  type PromptScriptDriftWarning,
  type SessionLinkState,
} from "../stores/chat.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import type { UserModelMessage } from "ai";

interface AttachPromptScriptOptions {
  filePath: string;
  metadata: PromptScriptMetadata;
  contentHash: string;
}

interface SendPromptOptions {
  sessionId: string;
  prompt: string;
  toolNames?: string[];
}

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function createDriftWarning(
  kind: PromptScriptDriftWarning["kind"],
  severity: PromptScriptDriftWarning["severity"],
  message: string,
): PromptScriptDriftWarning {
  return {
    kind,
    severity,
    message,
    acknowledged: false,
  } satisfies PromptScriptDriftWarning;
}

function sortByUpdatedAt(sessions: ChatSessionData[]): ChatSessionData[] {
  return [...sessions].sort((a, b) => {
    const left = new Date(a.updatedAt).getTime();
    const right = new Date(b.updatedAt).getTime();
    return right - left;
  });
}

export class ChatService {
  private readonly logger = new Logger({ name: "ChatService" });
  private sessionCacheLoaded = false;

  async hydrateSession(
    session: ChatSessionData,
    options: {
      hydration?: ChatHydrationStatus;
      driftWarnings?: PromptScriptDriftWarning[];
      isReplayQueued?: boolean;
    } = {},
  ): Promise<ChatSessionState> {
    const existing = chatSessions.get(session.id);
    const now = toIsoTimestamp();

    if (existing) {
      existing.data = session;
      existing.hydration = options.hydration ?? existing.hydration;
      existing.driftWarnings = options.driftWarnings ?? existing.driftWarnings;
      existing.lastSyncedAt = now;
      existing.isReplayQueued =
        options.isReplayQueued ?? existing.isReplayQueued;
      return existing;
    }

    const runtime: ChatSessionState = {
      data: session,
      hydration: options.hydration ?? "idle",
      driftWarnings: options.driftWarnings ?? [],
      lastSyncedAt: now,
      isReplayQueued: options.isReplayQueued ?? false,
    };

    chatSessions.set(session.id, runtime);
    return runtime;
  }

  async attachPromptScript(
    options: AttachPromptScriptOptions,
  ): Promise<SessionLinkState> {
    const { filePath, metadata, contentHash } = options;

    const warnings: PromptScriptDriftWarning[] = [];
    let status: SessionLinkState["status"] = "session_missing";
    let resolved: ChatSessionData | null = null;

    if (metadata.chatSessionId) {
      const sessionById = await this.safeGetSessionById(metadata.chatSessionId);
      if (sessionById) {
        resolved = sessionById;
        if (sessionById.scriptHash && sessionById.scriptHash !== contentHash) {
          status = "hash_mismatch";
          warnings.push(
            createDriftWarning(
              "hash_mismatch",
              "warning",
              "Prompt script content changed since the linked session was recorded. Run the script again to create a fresh session.",
            ),
          );
        } else {
          status = "none";
        }
      } else {
        warnings.push(
          createDriftWarning(
            "session_missing",
            "warning",
            "Linked chat session no longer exists. The script will run as new.",
          ),
        );
      }
    }

    if (!resolved) {
      const allSessions = await this.getAllSessions();
      const byHash = sortByUpdatedAt(
        allSessions.filter((session) => session.scriptHash === contentHash),
      );

      if (byHash.length === 1) {
        resolved = byHash[0];
        status = "none";
      } else if (byHash.length > 1) {
        resolved = byHash[0];
        status = "none";
        warnings.push(
          createDriftWarning(
            "metadata_conflict",
            "warning",
            "Multiple sessions share this script hash. Using the most recent one.",
          ),
        );
      }

      if (!resolved) {
        const byPath = sortByUpdatedAt(
          allSessions.filter((session) => session.scriptPath === filePath),
        );

        if (byPath.length === 1) {
          resolved = byPath[0];
          status =
            byPath[0].scriptHash && byPath[0].scriptHash !== contentHash
              ? "content_changed"
              : "none";
          if (status !== "none") {
            warnings.push(
              createDriftWarning(
                "script_changed",
                "warning",
                "Script content differs from the session snapshot. Consider replaying the script.",
              ),
            );
          }
        } else if (byPath.length > 1) {
          resolved = byPath[0];
          status = "content_changed";
          warnings.push(
            createDriftWarning(
              "metadata_conflict",
              "warning",
              "Multiple sessions reference this script path. Using the most recent one.",
            ),
          );
        }
      }
    }

    if (resolved) {
      await this.hydrateSession(resolved, { driftWarnings: warnings });
    }

    const link: SessionLinkState = {
      sessionId: resolved?.id ?? null,
      scriptHash: resolved?.scriptHash ?? null,
      status,
      warnings,
      lastAttachedAt: toIsoTimestamp(),
    };

    sessionLinks.set(filePath, link);

    return link;
  }

  detachSessionLink(filePath: string): void {
    sessionLinks.delete(filePath);
  }

  async refreshSession(sessionId: string): Promise<ChatSessionData | null> {
    const session = await this.safeGetSessionById(sessionId);
    if (session) {
      await this.hydrateSession(session);
    }
    return session;
  }

  async sendPrompt(options: SendPromptOptions) {
    const { sessionId, prompt, toolNames } = options;

    this.logger.info("Sending prompt", { sessionId });

    this.setHydration(sessionId, "streaming");

    try {
      const input: UserModelMessage = { role: "user", content: prompt };
      const result = await trpcClient.apiChat.sendMessage.mutate({
        chatSessionId: sessionId,
        input,
        toolNames,
      });

      await this.hydrateSession(result.session, { hydration: "idle" });
      this.updateLinkMetadata(result.session);

      return result;
    } catch (error) {
      this.logger.error("Failed to send prompt", error);
      this.setHydration(sessionId, "error");
      throw error;
    } finally {
      const runtime = chatSessions.get(sessionId);
      if (runtime && runtime.hydration === "streaming") {
        runtime.hydration = "idle";
      }
    }
  }

  async setSessionStatus(sessionId: string, status: ChatSessionStatus) {
    const runtime = chatSessions.get(sessionId);
    if (runtime) {
      runtime.data = {
        ...runtime.data,
        sessionStatus: status,
      };
      runtime.lastSyncedAt = toIsoTimestamp();
    }
  }

  private setHydration(
    sessionId: string,
    hydration: ChatHydrationStatus,
  ): ChatSessionState | null {
    const runtime = chatSessions.get(sessionId);
    if (!runtime) {
      return null;
    }

    runtime.hydration = hydration;
    runtime.lastSyncedAt = toIsoTimestamp();
    return runtime;
  }

  private async safeGetSessionById(
    sessionId: string,
  ): Promise<ChatSessionData | null> {
    try {
      const session = await trpcClient.apiChat.getSession.query({
        chatSessionId: sessionId,
      });
      return session;
    } catch (error) {
      this.logger.warn("Failed to resolve session by id", { sessionId, error });
      return null;
    }
  }

  private async getAllSessions(): Promise<ChatSessionData[]> {
    if (chatSessions.size > 0 || this.sessionCacheLoaded) {
      return [...chatSessions.values()].map((state) => state.data);
    }

    const sessions = await trpcClient.apiChat.listSessions.query();
    sessions.forEach((session) => void this.hydrateSession(session));
    this.sessionCacheLoaded = true;
    return sessions;
  }

  private updateLinkMetadata(session: ChatSessionData): void {
    const updatedAt = toIsoTimestamp();
    for (const link of sessionLinks.values()) {
      if (link.sessionId === session.id) {
        link.scriptHash = session.scriptHash ?? null;
        link.lastAttachedAt = updatedAt;
      }
    }
  }

  // Legacy methods retained temporarily to aid the ongoing refactor.
  // Each throws to surface unintended usage of the removed chat-file workflow.

  // async createChatDraft(_targetPath: string): Promise<never> {
  //   throw new Error(
  //     "Chat drafts are no longer supported. Create a prompt script instead.",
  //   );
  // }

  // async createChatFromTemplate(
  //   _templatePath: string,
  //   _args: string[],
  //   _targetDirectory: string,
  //   _config?: unknown,
  // ): Promise<never> {
  //   throw new Error(
  //     "Chat templates are no longer supported. Create a prompt script instead.",
  //   );
  // }

  // async openChatFile(_filePath: string): Promise<never> {
  //   throw new Error(
  //     "Chat files are no longer supported. Open the associated prompt script instead.",
  //   );
  // }

  // async sendMesage(
  //   _chat: ChatSessionData,
  //   _messageText: string,
  //   _modelId?: `${string}/${string}`,
  //   _attachments?: Array<{ fileName: string; content: string }>,
  // ): Promise<never> {
  //   throw new Error(
  //     "sendMesage is deprecated. Use sendPrompt with a chat session id.",
  //   );
  // }

  async getAllChats(): Promise<[]> {
    this.logger.warn("getAllChats is deprecated in the prompt-script workflow");
    return [];
  }

  async confirmToolCall(
    _absoluteFilePath: string,
    _chatSessionId: string,
    _toolCallId: string,
    _outcome: "yes" | "no" | "yes_always",
  ): Promise<never> {
    throw new Error(
      "Tool call confirmation must be handled through the new chat session APIs.",
    );
  }

  async abortChat(
    _absoluteFilePath: string,
    _chatSessionId: string,
  ): Promise<never> {
    throw new Error("Chat abort via file path is no longer supported.");
  }

  async getAvailableModels(): Promise<[]> {
    this.logger.warn(
      "Model discovery is not yet wired to the new chat service",
    );
    return [];
  }

  async deleteChat(_absoluteFilePath: string): Promise<never> {
    throw new Error(
      "Deleting chat files is not supported. Manage sessions through the database.",
    );
  }

  async rerunChat(
    _absoluteFilePath: string,
    _chatSessionId: string,
  ): Promise<never> {
    throw new Error(
      "rerunChat via chat files is not supported in the prompt-script workflow.",
    );
  }

  async savePromptDraft(
    _absoluteFilePath: string,
    _draft: string,
  ): Promise<never> {
    throw new Error(
      "Prompt drafts are now stored inside prompt scripts. Update the document directly.",
    );
  }

  handleFileEvent(_event: unknown): void {
    this.logger.warn(
      "File watcher chat events are ignored in the prompt-script workflow",
    );
  }

  handleChatEvent(event: ChatUpdatedEvent): void {
    const hydration: ChatHydrationStatus =
      event.updateType === "AI_RESPONSE_STARTED" ||
      event.updateType === "AI_RESPONSE_STREAMING"
        ? "streaming"
        : "idle";

    void this.hydrateSession(event.chat, { hydration })
      .then(() => {
        this.updateLinkMetadata(event.chat);
      })
      .catch((error) => {
        this.logger.error("Failed to hydrate chat session from event", {
          chatId: event.chatId,
          updateType: event.updateType,
          error,
        });
      });
  }

  togglePromptEditor = (): void => {
    throw new Error(
      "Prompt editor toggling is owned by the document workflow now.",
    );
  };
}

export const chatService = new ChatService();
