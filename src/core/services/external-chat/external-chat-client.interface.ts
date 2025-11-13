// src/core/services/external-chat/external-chat-client.interface.ts
import type {
  ChatMetadata,
  ChatSessionData,
} from "../chat/chat-session-repository.js";
import type { PromptSnapshot } from "../prompt/prompt-types.js";

export interface CreateExternalSessionInput {
  modelId: `${string}:${string}`;
  title?: string;
  workingDirectory?: string;
  metadata?: Partial<ChatMetadata>;
  sourcePromptId?: string | null;
  promptSnapshot?: PromptSnapshot;
  initialPrompt?: string | null;
}

export interface IExternalChatClient {
  createSession(input: CreateExternalSessionInput): Promise<ChatSessionData>;
  terminateSession(sessionId: string): Promise<ChatSessionData>;
}
