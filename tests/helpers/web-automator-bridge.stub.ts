// tests/helpers/web-automator-bridge.stub.ts
import { randomUUID } from "node:crypto";
import type {
  BridgeError,
  IWebAutomatorBridge,
  PageUpdatePayload,
  SubmitPromptOptions,
} from "../../src/core/services/external-chat/web-automator-bridge.js";
import type { SubmitPromptResult } from "../../src/core/services/external-chat/automators-v2.js";
import type { ConnectionStatus } from "../../src/core/services/external-chat/websocket-protocol.js";

type PageListener = (payload: PageUpdatePayload) => void;
type StatusListener = (status: ConnectionStatus) => void;
type ErrorListener = (error: BridgeError) => void;

export class WebAutomatorBridgeStub implements IWebAutomatorBridge {
  public submittedPrompts: SubmitPromptOptions[] = [];
  public lastSubmitResult: SubmitPromptResult | null = null;
  public lastStatus: ConnectionStatus | null = null;
  public lastPagePayload: PageUpdatePayload | null = null;
  public lastError: BridgeError | null = null;

  private readonly pageListeners = new Set<PageListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  async submitPrompt(options: SubmitPromptOptions): Promise<SubmitPromptResult> {
    this.submittedPrompts.push(options);
    const chatId =
      options.input.chatId ?? `stub-chat-${options.assistantId}-${randomUUID()}`;
    const result = { chatId };
    this.lastSubmitResult = result;
    return result;
  }

  onPageUpdate(listener: PageListener): () => void {
    this.pageListeners.add(listener);
    return () => this.pageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  emitPageUpdate(payload: PageUpdatePayload): void {
    this.lastPagePayload = payload;
    for (const listener of this.pageListeners) {
      listener(payload);
    }
  }

  emitStatus(status: ConnectionStatus): void {
    this.lastStatus = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  emitError(error: BridgeError): void {
    this.lastError = error;
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  reset(): void {
    this.submittedPrompts = [];
    this.lastSubmitResult = null;
    this.lastStatus = null;
    this.lastPagePayload = null;
    this.lastError = null;
  }
}
