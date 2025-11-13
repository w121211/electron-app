// src/core/services/external-chat/web-automator-bridge.ts
import { nanoid } from "nanoid";
import type { WebSocketServer } from "../../server/websocket-server.js";
import type {
  AiAssistantId,
  PageEvent,
  SubmitPromptInput,
  SubmitPromptResult,
} from "./automators-v2.js";
import type {
  ConnectionError,
  ConnectionStatus,
  ExtensionMessage,
  ServerMessage,
} from "./websocket-protocol.js";

export interface SubmitPromptOptions {
  assistantId: AiAssistantId;
  input: SubmitPromptInput;
}

interface PendingRequest {
  resolve: (result: SubmitPromptResult) => void;
  reject: (error: Error) => void;
}

export interface PageUpdatePayload {
  assistantId: AiAssistantId;
  watchId?: string;
  event: PageEvent;
}

type PageUpdateListener = (payload: PageUpdatePayload) => void;
type StatusListener = (status: ConnectionStatus) => void;
type ErrorListener = (error: BridgeError) => void;

export type BridgeError =
  | { kind: "transport"; error: unknown }
  | { kind: "connection"; error: ConnectionError }
  | { kind: "request"; assistantId: AiAssistantId; error: Error };

interface WebAutomatorBridgeConfig {
  defaultAssistant: AiAssistantId;
  clientId?: string;
  port?: number;
}

export interface IWebAutomatorBridge {
  onPageUpdate(listener: PageUpdateListener): () => void;
  onStatus(listener: StatusListener): () => void;
  onError(listener: ErrorListener): () => void;
  submitPrompt(options: SubmitPromptOptions): Promise<SubmitPromptResult>;
}

export class WebAutomatorBridge implements IWebAutomatorBridge {
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly pageUpdateListeners = new Set<PageUpdateListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(
    private readonly websocketServer: WebSocketServer,
    private readonly config: WebAutomatorBridgeConfig,
  ) {
    this.websocketServer.onConnection((state) => {
      if (state === "connected") {
        this.sendHello();
      } else {
        this.rejectAllPending(
          new Error("WebSocket connection closed by automator."),
        );
      }
    });

    this.websocketServer.onMessage((message) => this.handleMessage(message));
    this.websocketServer.onError((error) =>
      this.emitError({ kind: "transport", error }),
    );
  }

  onPageUpdate(listener: PageUpdateListener): () => void {
    this.pageUpdateListeners.add(listener);
    return () => this.pageUpdateListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async submitPrompt(options: SubmitPromptOptions): Promise<SubmitPromptResult> {
    const requestId = nanoid();

    const payload: ServerMessage = {
      type: "ws:submit-prompt",
      assistant: options.assistantId,
      requestId,
      input: options.input,
    };

    return new Promise<SubmitPromptResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      try {
        this.websocketServer.send(payload);
      } catch (error) {
        this.pendingRequests.delete(requestId);
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to send prompt to automator."),
        );
      }
    });
  }

  private handleMessage(message: ExtensionMessage): void {
    switch (message.type) {
      case "connection:status":
        this.statusListeners.forEach((listener) =>
          listener(message.payload),
        );
        break;
      case "connection:error":
        this.emitError({ kind: "connection", error: message.payload });
        break;
      case "ws:watch-page-update":
        this.pageUpdateListeners.forEach((listener) =>
          listener({
            assistantId: message.assistantId,
            watchId: message.watchId,
            event: message.payload,
          }),
        );
        break;
      case "ws:submit-prompt-result":
        this.resolvePending(message.requestId, message.payload);
        break;
      case "ws:error":
        if (message.requestId) {
          this.rejectPending(
            message.requestId,
            new Error(message.payload.message),
          );
        } else {
          this.emitError({
            kind: "request",
            assistantId: message.assistantId,
            error: new Error(message.payload.message),
          });
        }
        break;
      case "ws:run-tests-result":
        break;
    }
  }

  private resolvePending(
    requestId: string,
    result: SubmitPromptResult,
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(requestId);
    pending.resolve(result);
  }

  private rejectPending(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(requestId);
    pending.reject(error);
  }

  private rejectAllPending(error: Error): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  private emitError(error: BridgeError): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  private sendHello(): void {
    try {
      this.websocketServer.send({
        type: "connection:hello",
        assistant: this.config.defaultAssistant,
        client: this.config.clientId ?? "electron-app",
        port: this.config.port,
      });
    } catch (error) {
      this.emitError({ kind: "transport", error });
    }
  }
}
