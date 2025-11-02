// src/core/services/chat/chat-service.ts
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import { getModelSurface } from "../../utils/model-utils.js";
import type { PromptService } from "../prompt/prompt-service.js";
import type { PromptSnapshot } from "../prompt/prompt-types.js";
import type {
  ChatMessage,
  ChatMetadata,
  ChatSessionData,
} from "./chat-session-repository.js";
import type { ApiChatClient } from "../chat-engine/api-chat-client.js";
import type { TerminalChatClient } from "../external-chat/terminal-chat-client.js";
import type { WebChatClient } from "../external-chat/web-chat-client.js";

export interface CreateChatParams {
  modelId: `${string}/${string}`;
  title?: string;
  sourcePromptId?: string | null;
  promptArgs?: Record<string, unknown>;
  initialMessages?: ModelMessage[];
  metadata?: Partial<ChatMetadata>;
  workingDirectory?: string | null;
}

interface ChatServiceDependencies {
  promptService: PromptService;
  apiChatClient: ApiChatClient;
  terminalChatClient: TerminalChatClient;
  webChatClient: WebChatClient;
}

export class ChatService {
  private readonly promptService: PromptService;
  private readonly apiChatClient: ApiChatClient;
  private readonly terminalChatClient: TerminalChatClient;
  private readonly webChatClient: WebChatClient;

  constructor(dependencies: ChatServiceDependencies) {
    this.promptService = dependencies.promptService;
    this.apiChatClient = dependencies.apiChatClient;
    this.terminalChatClient = dependencies.terminalChatClient;
    this.webChatClient = dependencies.webChatClient;
  }

  async createChat(params: CreateChatParams): Promise<ChatSessionData> {
    const surface = getModelSurface(params.modelId);

    const resolvedMetadata: Partial<ChatMetadata> = {
      ...params.metadata,
      modelId: params.modelId,
      modelSurface: surface,
    };

    if (params.title) {
      resolvedMetadata.title = params.title;
    }

    let promptSnapshot: PromptSnapshot | undefined;
    let sourcePromptId: string | null = params.sourcePromptId ?? null;
    let renderedPrompt: string | null = null;

    if (sourcePromptId) {
      const prompt = await this.promptService.getPrompt(sourcePromptId);
      if (!prompt) {
        throw new Error(`Prompt ${sourcePromptId} not found`);
      }

      promptSnapshot = this.promptService.buildSnapshot(
        prompt,
        params.promptArgs,
      );

      renderedPrompt = this.promptService.applyPromptArgs(
        prompt.content,
        params.promptArgs ?? {},
      );

      if (!resolvedMetadata.title && prompt.metadata?.title) {
        resolvedMetadata.title = String(prompt.metadata.title);
      }
    }

    if (promptSnapshot) {
      resolvedMetadata.promptSnapshot = promptSnapshot;
    }

    const initialModelMessages = this.composeInitialMessages(
      renderedPrompt,
      params.initialMessages,
    );

    if (surface === "terminal") {
      return this.createTerminalChat({
        params,
        metadata: resolvedMetadata,
        promptSnapshot,
        sourcePromptId,
        initialModelMessages,
      });
    }

    if (surface === "web") {
      return this.createWebChat({
        params,
        metadata: resolvedMetadata,
        promptSnapshot,
        sourcePromptId,
        initialModelMessages,
      });
    }

    return this.createApiChat({
      metadata: resolvedMetadata,
      sourcePromptId,
      initialModelMessages,
    });
  }

  private composeInitialMessages(
    renderedPrompt: string | null,
    additional: ModelMessage[] | undefined,
  ): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (renderedPrompt && renderedPrompt.trim().length > 0) {
      messages.push({
        role: "user",
        content: renderedPrompt,
      });
    }

    if (additional && additional.length > 0) {
      messages.push(...additional);
    }

    return messages;
  }

  private createChatMessages(messages: ModelMessage[]): ChatMessage[] {
    const timestamp = new Date();

    return messages.map((message, index) => ({
      id: randomUUID(),
      message,
      metadata: {
        timestamp: new Date(timestamp.getTime() + index),
      },
    }));
  }

  private async createApiChat(options: {
    metadata: Partial<ChatMetadata>;
    sourcePromptId: string | null;
    initialModelMessages: ModelMessage[];
  }): Promise<ChatSessionData> {
    const chatMessages = this.createChatMessages(options.initialModelMessages);

    return this.apiChatClient.createSession({
      modelSurface: "api",
      metadata: options.metadata,
      messages: chatMessages,
      sourcePromptId: options.sourcePromptId ?? null,
    });
  }

  private async createTerminalChat(options: {
    params: CreateChatParams;
    metadata: Partial<ChatMetadata>;
    promptSnapshot?: PromptSnapshot;
    sourcePromptId: string | null;
    initialModelMessages: ModelMessage[];
  }): Promise<ChatSessionData> {
    if (!options.params.workingDirectory) {
      throw new Error("Terminal chats require a working directory.");
    }

    return this.terminalChatClient.createSession({
      modelId: options.params.modelId,
      title: options.metadata.title ?? options.params.title,
      workingDirectory: options.params.workingDirectory,
      metadata: options.metadata,
      sourcePromptId: options.sourcePromptId ?? null,
      promptSnapshot: options.promptSnapshot,
    });
  }

  private async createWebChat(options: {
    params: CreateChatParams;
    metadata: Partial<ChatMetadata>;
    promptSnapshot?: PromptSnapshot;
    sourcePromptId: string | null;
    initialModelMessages: ModelMessage[];
  }): Promise<ChatSessionData> {
    return this.webChatClient.createSession({
      modelId: options.params.modelId,
      title: options.metadata.title ?? options.params.title,
      metadata: options.metadata,
      sourcePromptId: options.sourcePromptId ?? null,
      promptSnapshot: options.promptSnapshot,
    });
  }
}
