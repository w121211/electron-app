// src/core/services/chat-engine/api-chat-client.ts
import { gateway } from "@ai-sdk/gateway";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { LanguageModelV2Middleware } from "@ai-sdk/provider";
import {
  streamText,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type ToolResultPart,
  type ToolSet,
  type TypedToolCall,
  type UserModelMessage,
} from "ai";
import type { IEventBus } from "../../event-bus.js";
import type {
  ChatMessage,
  ChatMessageMetadata,
  ChatMetadata,
  ChatSessionData,
  ChatSessionRepository,
  ChatState,
  ChatSessionType,
} from "../chat/chat-session-repository.js";
import {
  ChatMessageSchema,
  ChatMetadataSchema,
  ChatSessionTypeSchema,
  ChatStateSchema,
} from "../chat/chat-session-repository.js";
import {
  extractChatFileReferences,
  getUserModelMessageContentString,
  getModelMessageContentString,
  processMultimodalFileReferences,
} from "../../utils/message-utils.js";
import {
  ToolCallRunner,
  type ToolExecutionResult,
} from "../tool-call/tool-call-runner.js";
import type {
  ToolCallConfirmation,
  ToolCallConfirmationOutcome,
} from "../tool-call/tool-call-confirmation.js";
import { ToolConfirmationRequiredError } from "../tool-call/tool-call-confirmation.js";
import type { ToolRegistry } from "../tool-call/tool-registry.js";
import type { ChatUpdatedEvent } from "./events.js";

const DEFAULT_MAX_TURNS = 20;

export interface CreateChatSessionInput {
  sessionType: ChatSessionType;
  metadata?: Partial<ChatMetadata>;
  messages?: ChatMessage[];
  state?: ChatState;
  script?: {
    path?: string | null;
    modifiedAt?: Date | null;
    hash?: string | null;
    snapshot?: string | null;
  };
}

export const CreateChatSessionInputSchema: z.ZodType<CreateChatSessionInput> = z
  .object({
    sessionType: ChatSessionTypeSchema,
    metadata: ChatMetadataSchema.optional(),
    messages: z.array(ChatMessageSchema).optional(),
    state: ChatStateSchema.optional(),
    script: z
      .object({
        path: z.string().nullable().optional(),
        modifiedAt: z.coerce.date().nullable().optional(),
        hash: z.string().nullable().optional(),
        snapshot: z.string().nullable().optional(),
      })
      .optional(),
  })
  .transform((value) => ({
    ...value,
    metadata: value.metadata ?? {},
    messages: value.messages ?? [],
  }));

export interface SendChatMessageInput {
  chatSessionId: string;
  input: UserModelMessage | ToolExecutionResult<ToolSet>;
  toolNames?: string[];
}

export interface ApiTurnResult {
  state: ChatState;
  currentTurn: number;
  streamResult?: StreamTextResult<ToolSet, never>;
  toolCallsAwaitingConfirmation?: Array<TypedToolCall<ToolSet>>;
}

interface RunTurnOptions {
  toolNames?: string[];
  externalSignal?: AbortSignal;
}

interface ActiveTurnState {
  abortController: AbortController;
}

function cloneMetadata(metadata: ChatMetadata | undefined): ChatMetadata {
  if (!metadata) {
    return {};
  }

  return structuredClone(metadata);
}

function ensureTimestamp(metadata: ChatMessageMetadata): ChatMessageMetadata {
  return { ...metadata, timestamp: new Date(metadata.timestamp) };
}

class ApiChatSession {
  readonly id: string;
  readonly sessionType: ChatSessionType;
  private messages: ChatMessage[];
  private metadata: ChatMetadata;
  private state: ChatState;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private scriptPath: string | null;
  private scriptModifiedAt: Date | null;
  private scriptHash: string | null;
  private scriptSnapshot: string | null;
  private readonly toolCallRunner: ToolCallRunner<ToolSet>;
  private readonly toolRegistry: ToolRegistry;
  private readonly eventBus: IEventBus;
  private readonly cacheMiddleware?: LanguageModelV2Middleware;
  private currentAbortController: AbortController | null = null;
  private toolCallsAwaitingConfirmation: Array<TypedToolCall<ToolSet>>;
  private toolCallConfirmations: Array<ToolCallConfirmation>;
  private toolAlwaysAllowRules: Array<{
    toolName: string;
    sourceConfirmation: ToolCallConfirmation;
  }>;

  constructor(
    data: ChatSessionData,
    dependencies: {
      toolRegistry: ToolRegistry;
      eventBus: IEventBus;
      cacheMiddleware?: LanguageModelV2Middleware;
    },
  ) {
    this.id = data.id;
    this.sessionType = data.sessionType;
    this.messages = data.messages.map((message) => ({
      ...message,
      metadata: ensureTimestamp(message.metadata),
    }));
    this.metadata = cloneMetadata(data.metadata);
    this.state = data.state;
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt);
    this.scriptPath = data.scriptPath ?? null;
    this.scriptModifiedAt = data.scriptModifiedAt ?? null;
    this.scriptHash = data.scriptHash ?? null;
    this.scriptSnapshot = data.scriptSnapshot ?? null;
    this.toolRegistry = dependencies.toolRegistry;
    this.eventBus = dependencies.eventBus;
    this.cacheMiddleware = dependencies.cacheMiddleware;
    this.toolCallRunner = new ToolCallRunner(this.toolRegistry, this.eventBus);

    this.toolCallsAwaitingConfirmation =
      this.metadata.toolCallsAwaitingConfirmation?.map((call) => ({
        ...call,
      })) ?? [];
    this.toolCallConfirmations =
      this.metadata.toolCallConfirmations?.map((confirmation) => ({
        ...confirmation,
        timestamp: new Date(confirmation.timestamp),
      })) ?? [];
    this.toolAlwaysAllowRules =
      this.metadata.toolAlwaysAllowRules?.map((rule) => ({
        toolName: rule.toolName,
        sourceConfirmation: {
          ...rule.sourceConfirmation,
          timestamp: new Date(rule.sourceConfirmation.timestamp),
        },
      })) ?? [];
  }

  get currentTurn(): number {
    return this.metadata.currentTurn ?? 0;
  }

  get modelId(): `${string}/${string}` {
    const modelId = this.metadata.modelId;
    if (!modelId) {
      throw new Error("Chat session metadata is missing modelId");
    }
    return modelId;
  }

  get maxTurns(): number {
    return this.metadata.maxTurns ?? DEFAULT_MAX_TURNS;
  }

  get toolSet(): ToolSet | undefined {
    return this.metadata.toolSet;
  }

  get chatState(): ChatState {
    return this.state;
  }

  set chatState(newState: ChatState) {
    this.state = newState;
  }

  async runTurn(
    input: UserModelMessage | ToolExecutionResult<ToolSet>,
    options?: RunTurnOptions,
  ): Promise<ApiTurnResult> {
    if (options?.externalSignal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (this.currentTurn >= this.maxTurns) {
      this.state = "terminated";
      return {
        state: this.state,
        currentTurn: this.currentTurn,
      };
    }

    const abortController = new AbortController();
    this.currentAbortController = abortController;

    const signal = options?.externalSignal
      ? this.combineAbortSignals(options.externalSignal, abortController.signal)
      : abortController.signal;

    try {
      this.state = "active:generating";
      this.updatedAt = new Date();

      if (
        this.toolSet === undefined &&
        options?.toolNames &&
        options.toolNames.length > 0
      ) {
        if (this.currentTurn !== 0) {
          throw new Error("Tool set must be configured on the first turn");
        }

        const toolSet = this.toolRegistry.getToolSetByNames(options.toolNames);
        this.metadata.toolSet = toolSet;
        await this.emitUpdateEvent("METADATA_UPDATED", {
          metadata: { toolSet },
        });
      }

      if ("status" in input) {
        this.handleToolExecutionResult(input);
        return {
          state: this.state,
          currentTurn: this.currentTurn,
        };
      }

      await this.appendUserMessage(input);

      const streamResult = await this.generateAssistantResponse(signal);

      this.metadata.currentTurn = this.currentTurn + 1;

      if (this.toolCallsAwaitingConfirmation.length > 0) {
        this.state = "active:awaiting_input";
        this.metadata.toolCallsAwaitingConfirmation =
          this.toolCallsAwaitingConfirmation.map((toolCall) => ({
            ...toolCall,
          }));
        await this.emitStatusChange();
        return {
          state: this.state,
          currentTurn: this.currentTurn,
          streamResult,
          toolCallsAwaitingConfirmation: this.toolCallsAwaitingConfirmation,
        };
      }

      this.state = "active";
      this.toolCallsAwaitingConfirmation = [];
      this.metadata.toolCallsAwaitingConfirmation = [];
      this.metadata.toolCallConfirmations = [];
      await this.emitStatusChange();
      return {
        state: this.state,
        currentTurn: this.currentTurn,
        streamResult,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.state = "active";
        await this.emitStatusChange();
        throw new Error("Operation cancelled by user");
      }
      throw error;
    } finally {
      this.currentAbortController?.abort();
      this.currentAbortController = null;
    }
  }

  async confirmToolCall(
    toolCallId: string,
    outcome: ToolCallConfirmationOutcome,
  ): Promise<ToolExecutionResult<ToolSet>> {
    const confirmation: ToolCallConfirmation = {
      toolCallId,
      outcome,
      timestamp: new Date(),
    };

    if (outcome === "yes_always") {
      const toolCall = this.toolCallsAwaitingConfirmation.find(
        (pending) => pending.toolCallId === toolCallId,
      );
      if (toolCall) {
        this.toolAlwaysAllowRules.push({
          toolName: toolCall.toolName,
          sourceConfirmation: confirmation,
        });
        this.metadata.toolAlwaysAllowRules = this.toolAlwaysAllowRules.map(
          (rule) => ({
            toolName: rule.toolName,
            sourceConfirmation: {
              ...rule.sourceConfirmation,
              timestamp: new Date(rule.sourceConfirmation.timestamp),
            },
          }),
        );
      }
    }

    this.toolCallConfirmations.push(confirmation);
    this.metadata.toolCallConfirmations = this.toolCallConfirmations.map(
      (item) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }),
    );

    const result = await this.toolCallRunner.execute(
      this.toolCallsAwaitingConfirmation,
      this.toolCallConfirmations,
      this.toolAlwaysAllowRules,
      {
        chatSessionId: this.id,
        messages: this.messages.map((message) => message.message),
      },
    );

    if (result.status === "awaiting_confirmations") {
      this.toolCallsAwaitingConfirmation =
        result.toolCallsAwaitingConfirmation.map((toolCall) => ({
          ...toolCall,
        }));
      this.metadata.toolCallsAwaitingConfirmation =
        this.toolCallsAwaitingConfirmation.map((toolCall) => ({ ...toolCall }));
      this.state = "active:awaiting_input";
      await this.emitStatusChange();
      return result;
    }

    this.toolCallsAwaitingConfirmation = [];
    this.metadata.toolCallsAwaitingConfirmation = [];
    this.toolCallConfirmations = [];
    this.metadata.toolCallConfirmations = [];
    return result;
  }

  abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }

  toChatSessionData(): ChatSessionData {
    return {
      id: this.id,
      sessionType: this.sessionType,
      state: this.state,
      messages: this.messages.map((message) => ({
        ...message,
        metadata: {
          ...message.metadata,
          timestamp: new Date(message.metadata.timestamp),
        },
      })),
      metadata: {
        ...this.metadata,
        toolCallsAwaitingConfirmation: this.toolCallsAwaitingConfirmation.map(
          (toolCall) => ({ ...toolCall }),
        ),
        toolCallConfirmations: this.toolCallConfirmations.map(
          (confirmation) => ({
            ...confirmation,
            timestamp: new Date(confirmation.timestamp),
          }),
        ),
        toolAlwaysAllowRules: this.toolAlwaysAllowRules.map((rule) => ({
          toolName: rule.toolName,
          sourceConfirmation: {
            ...rule.sourceConfirmation,
            timestamp: new Date(rule.sourceConfirmation.timestamp),
          },
        })),
      },
      scriptPath: this.scriptPath,
      scriptModifiedAt: this.scriptModifiedAt,
      scriptHash: this.scriptHash,
      scriptSnapshot: this.scriptSnapshot,
      createdAt: this.createdAt,
      updatedAt: new Date(this.updatedAt),
    };
  }

  private combineAbortSignals(
    external: AbortSignal,
    internal: AbortSignal,
  ): AbortSignal {
    const controller = new AbortController();

    const forwardAbort = () => {
      controller.abort();
    };

    if (external.aborted || internal.aborted) {
      controller.abort();
      return controller.signal;
    }

    external.addEventListener("abort", forwardAbort, { once: true });
    internal.addEventListener("abort", forwardAbort, { once: true });

    return controller.signal;
  }

  private async appendUserMessage(input: UserModelMessage): Promise<void> {
    const content = getUserModelMessageContentString(input);
    const fileReferences = extractChatFileReferences(content);

    let processedInput = input;
    if (this.metadata.projectPath && fileReferences.length > 0) {
      const multimodalContent = await processMultimodalFileReferences(
        content,
        this.metadata.projectPath,
      );
      processedInput = { role: "user", content: multimodalContent };
    }

    const message: ChatMessage = {
      id: uuidv4(),
      message: processedInput,
      metadata: {
        timestamp: new Date(),
        fileReferences: fileReferences.length > 0 ? fileReferences : undefined,
      },
    };

    this.messages.push(message);
    this.updatedAt = new Date();
    await this.emitUpdateEvent("MESSAGE_ADDED", { message });
  }

  private handleToolExecutionResult(
    result: ToolExecutionResult<ToolSet>,
  ): void {
    if (result.status !== "completed") {
      throw new Error("Tool execution must be completed to append results");
    }

    if (result.executed.length === 0) {
      throw new Error("No tool executions found in result");
    }

    const toolMessage: ChatMessage = {
      id: uuidv4(),
      message: {
        role: "tool",
        content: result.executed as Array<ToolResultPart>,
      },
      metadata: {
        timestamp: new Date(),
      },
    };

    this.messages.push(toolMessage);
    this.updatedAt = new Date();
    void this.emitUpdateEvent("MESSAGE_ADDED", { message: toolMessage });
  }

  private async generateAssistantResponse(
    signal: AbortSignal,
  ): Promise<StreamTextResult<ToolSet, never>> {
    const baseModel = gateway(this.modelId);
    const model = this.cacheMiddleware
      ? wrapLanguageModel({
          model: baseModel,
          middleware: this.cacheMiddleware,
        })
      : baseModel;

    const streamResult = streamText({
      model,
      messages: this.messages.map((message) => message.message),
      tools: this.toolSet,
      abortSignal: signal,
    });

    await this.emitUpdateEvent("AI_RESPONSE_STARTED", {
      state: this.state,
    });

    const trackedToolCalls = new Map<string, TypedToolCall<ToolSet>>();

    for await (const chunk of streamResult.fullStream) {
      switch (chunk.type) {
        case "text-delta":
          await this.emitUpdateEvent("AI_RESPONSE_STREAMING", {
            chunk: chunk.text,
          });
          break;
        case "tool-call":
          trackedToolCalls.set(chunk.toolCallId, chunk);
          break;
        case "tool-error":
          if (chunk.error instanceof ToolConfirmationRequiredError) {
            const pending = trackedToolCalls.get(chunk.toolCallId);
            if (!pending) {
              throw new Error(
                `Tool call ${chunk.toolCallId} missing for confirmation`,
              );
            }
            this.toolCallsAwaitingConfirmation.push(pending);
          }
          break;
      }
    }

    const assistantMessages = (await streamResult.response).messages.map(
      (message) => this.transformAssistantMessage(message),
    );

    for (const assistantMessage of assistantMessages) {
      this.messages.push(assistantMessage);
      await this.emitUpdateEvent("MESSAGE_ADDED", {
        message: assistantMessage,
      });
    }

    this.updatedAt = new Date();

    await this.emitUpdateEvent("AI_RESPONSE_COMPLETED", {
      finalContent: assistantMessages
        .map((message) => getModelMessageContentString(message.message))
        .join("\n"),
    });

    return streamResult;
  }

  private transformAssistantMessage(message: ModelMessage): ChatMessage {
    return {
      id: uuidv4(),
      message,
      metadata: {
        timestamp: new Date(),
      },
    };
  }

  private async emitUpdateEvent(
    updateType: ChatUpdatedEvent["updateType"],
    update: ChatUpdatedEvent["update"],
  ): Promise<void> {
    const event: ChatUpdatedEvent = {
      kind: "ChatUpdatedEvent",
      chatId: this.id,
      updateType,
      update,
      chat: this.toChatSessionData(),
      timestamp: new Date(),
    };

    await this.eventBus.emit(event);
  }

  private async emitStatusChange(): Promise<void> {
    await this.emitUpdateEvent("STATUS_CHANGED", {
      state: this.state,
    });
  }
}

export class ApiChatClient {
  private readonly repository: ChatSessionRepository;
  private readonly eventBus: IEventBus;
  private readonly toolRegistry: ToolRegistry;
  private readonly cacheMiddleware?: LanguageModelV2Middleware;
  private readonly activeTurns: Map<string, ActiveTurnState> = new Map();

  constructor(options: {
    repository: ChatSessionRepository;
    eventBus: IEventBus;
    toolRegistry: ToolRegistry;
    cacheMiddleware?: LanguageModelV2Middleware;
  }) {
    this.repository = options.repository;
    this.eventBus = options.eventBus;
    this.toolRegistry = options.toolRegistry;
    this.cacheMiddleware = options.cacheMiddleware;
  }

  async createSession(input: CreateChatSessionInput): Promise<ChatSessionData> {
    const timestamp = new Date();
    const session: ChatSessionData = {
      id: uuidv4(),
      sessionType: input.sessionType,
      state: input.state ?? "active",
      messages: (input.messages ?? []).map((message) => ({
        ...message,
        metadata: ensureTimestamp(message.metadata),
      })),
      metadata: this.initializeMetadata(input.metadata),
      scriptPath: input.script?.path ?? null,
      scriptModifiedAt: input.script?.modifiedAt ?? null,
      scriptHash: input.script?.hash ?? null,
      scriptSnapshot: input.script?.snapshot ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.create(session);
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSessionData | null> {
    return this.repository.getById(sessionId);
  }

  async listSessions(): Promise<ChatSessionData[]> {
    return this.repository.list();
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.repository.delete(sessionId);
  }

  async sendMessage(input: SendChatMessageInput): Promise<{
    turnResult: ApiTurnResult;
    session: ChatSessionData;
  }> {
    const session = await this.loadSession(input.chatSessionId);
    const result = await this.runTurn(session, input.input, {
      toolNames: input.toolNames,
    });
    const sessionData = session.toChatSessionData();
    await this.repository.update(sessionData);
    return { turnResult: result, session: sessionData };
  }

  async confirmToolCall(
    chatSessionId: string,
    toolCallId: string,
    outcome: ToolCallConfirmationOutcome,
  ): Promise<{
    turnResult: ApiTurnResult;
    session: ChatSessionData;
  }> {
    const session = await this.loadSession(chatSessionId);
    const toolExecutionResult = await session.confirmToolCall(
      toolCallId,
      outcome,
    );
    if (toolExecutionResult.status === "awaiting_confirmations") {
      const data = session.toChatSessionData();
      await this.repository.update(data);
      return {
        turnResult: {
          state: session.chatState,
          currentTurn: session.currentTurn,
          toolCallsAwaitingConfirmation:
            toolExecutionResult.toolCallsAwaitingConfirmation,
        },
        session: data,
      };
    }

    const result = await this.runTurn(session, toolExecutionResult);
    const data = session.toChatSessionData();
    await this.repository.update(data);
    return { turnResult: result, session: data };
  }

  abort(chatSessionId: string): void {
    const active = this.activeTurns.get(chatSessionId);
    if (active) {
      active.abortController.abort();
    }
  }

  private async loadSession(sessionId: string): Promise<ApiChatSession> {
    const data = await this.repository.getById(sessionId);
    if (!data) {
      throw new Error(`Chat session ${sessionId} not found`);
    }

    return new ApiChatSession(data, {
      toolRegistry: this.toolRegistry,
      eventBus: this.eventBus,
      cacheMiddleware: this.cacheMiddleware,
    });
  }

  private async runTurn(
    session: ApiChatSession,
    input: UserModelMessage | ToolExecutionResult<ToolSet>,
    options?: RunTurnOptions,
  ): Promise<ApiTurnResult> {
    const abortController = new AbortController();
    this.activeTurns.set(session.id, { abortController });

    try {
      return await session.runTurn(input, {
        toolNames: options?.toolNames,
        externalSignal: abortController.signal,
      });
    } finally {
      this.activeTurns.delete(session.id);
    }
  }

  private initializeMetadata(
    metadata: Partial<ChatMetadata> | undefined,
  ): ChatMetadata {
    const base: ChatMetadata = {
      currentTurn: metadata?.currentTurn ?? 0,
      maxTurns: metadata?.maxTurns ?? DEFAULT_MAX_TURNS,
    };

    if (!metadata) {
      return base;
    }

    return {
      ...metadata,
      currentTurn: metadata.currentTurn ?? base.currentTurn,
      maxTurns: metadata.maxTurns ?? base.maxTurns,
    };
  }
}
