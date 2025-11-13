// scripts/mock-web-automator.ts
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import { Logger } from "tslog";
import type {
  AiAssistantId,
  ChatMessage as AutomatorChatMessage,
  ChatStatus,
} from "../src/core/services/external-chat/automators-v2.js";
import type { ServerMessage } from "../src/core/services/external-chat/websocket-protocol.js";

interface SessionState {
  chatId: string;
  title: string;
  modelId?: string;
  messages: AutomatorChatMessage[];
}

interface Options {
  port: number;
  assistant: AiAssistantId;
  reconnectDelay: number;
}

const DEFAULT_OPTIONS: Options = {
  port: 3456,
  assistant: "chatgpt",
  reconnectDelay: 1000,
};

const args = parseArgs({
  options: {
    port: { type: "string" },
    assistant: { type: "string" },
    reconnect: { type: "string" },
  },
});

const options: Options = {
  port: parsePort(
    args.values.port ?? process.env.MOCK_AUTOMATOR_PORT,
    DEFAULT_OPTIONS.port,
  ),
  assistant: parseAssistant(
    args.values.assistant ?? process.env.MOCK_AUTOMATOR_ASSISTANT,
    DEFAULT_OPTIONS.assistant,
  ),
  reconnectDelay: parsePort(
    args.values.reconnect ?? process.env.MOCK_AUTOMATOR_RECONNECT_MS,
    DEFAULT_OPTIONS.reconnectDelay,
  ),
};

const logger = new Logger({ name: "mock-automator" });

const sessions = new Map<string, SessionState>();
let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let closedExplicitly = false;

connect();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function connect(): void {
  clearReconnectTimer();
  const url = `ws://127.0.0.1:${options.port}`;
  logger.info(`Connecting to ${url} as ${options.assistant}…`);

  socket = new WebSocket(url);

  socket.on("open", () => {
    logger.info("Connected. Signaling status…");
    sendStatus("connecting");
    setTimeout(() => sendStatus("open"), 200);
  });

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as ServerMessage;
      logger.info("⬇️ INBOUND", { message });
      handleServerMessage(message);
    } catch (error) {
      logger.error("Failed to parse server message", error);
    }
  });

  socket.on("error", (error) => {
    logger.error("Socket error", error);
    sendStatus("error", (error as Error)?.message ?? "Socket error");
  });

  socket.on("close", () => {
    if (closedExplicitly) {
      return;
    }
    logger.warn("Disconnected. Reconnecting…");
    scheduleReconnect();
  });
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "connection:hello":
      logger.info(`Received hello from ${message.client ?? "server"}.`);
      break;
    case "ws:submit-prompt":
      void handleSubmitPrompt(message);
      break;
    case "ws:run-tests":
      logger.info("Ignoring run-tests request.");
      break;
    default:
      logger.warn("Unsupported server message", { message });
  }
}

async function handleSubmitPrompt(
  message: Extract<ServerMessage, { type: "ws:submit-prompt" }>,
): Promise<void> {
  const chatId = message.input.chatId ?? `mock-chat-${randomUUID()}`;
  const session = ensureSession(chatId, message.input.modelId);

  session.modelId = message.input.modelId ?? session.modelId;
  pushMessage(session, "user", message.input.prompt);

  respond({
    type: "ws:submit-prompt-result",
    assistantId: message.assistant,
    requestId: message.requestId,
    payload: { chatId },
  });

  emitPageUpdate(session, "generating");

  await delay(700);
  pushMessage(session, "assistant", generateResponse(message.input.prompt));
  emitPageUpdate(session, "idle");
}

function ensureSession(chatId: string, modelId?: string): SessionState {
  const match = sessions.get(chatId);
  if (match) {
    return match;
  }
  const created: SessionState = {
    chatId,
    title: `Mock Chat ${chatId.slice(-4)}`,
    modelId,
    messages: [],
  };
  sessions.set(chatId, created);
  return created;
}

function pushMessage(
  session: SessionState,
  role: AutomatorChatMessage["role"],
  content: string,
): void {
  session.messages.push({
    id: randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  });
}

function emitPageUpdate(session: SessionState, status: ChatStatus): void {
  respond({
    type: "ws:watch-page-update",
    assistantId: options.assistant,
    watchId: session.chatId,
    payload: {
      timestamp: new Date(),
      page: {
        slug: "chat-page",
        chatId: session.chatId,
        status,
        url: `https://mock.${options.assistant}.local/${session.chatId}`,
        title: session.title,
        modelId: session.modelId ?? `${options.assistant}-default`,
        messages: session.messages,
        updatedAt: new Date().toISOString(),
        isLoggedIn: true,
      },
    },
  });
}

function sendStatus(
  status: "connecting" | "open" | "closed" | "error",
  message?: string,
): void {
  respond({
    type: "connection:status",
    payload: { status, message },
  });
}

function respond(payload: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    logger.warn("Cannot send message: socket not open.");
    return;
  }
  logger.info("⬆️ OUTBOUND", { payload });
  socket.send(JSON.stringify(payload));
}

function generateResponse(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "(mock) No prompt content received.";
  }
  if (trimmed.length < 120) {
    return `Mock response: ${trimmed} — processed successfully.`;
  }
  return `Mock response summary: ${trimmed.slice(0, 120)}…`;
}

function scheduleReconnect(): void {
  if (reconnectTimer || closedExplicitly) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, options.reconnectDelay);
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function shutdown(): void {
  closedExplicitly = true;
  clearReconnectTimer();
  if (socket) {
    socket.close();
  }
  logger.info("Shutdown complete.");
  process.exit(0);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAssistant(
  value: string | undefined,
  fallback: AiAssistantId,
): AiAssistantId {
  if (!value) {
    return fallback;
  }
  if (
    value === "chatgpt" ||
    value === "claude" ||
    value === "gemini" ||
    value === "grok"
  ) {
    return value;
  }
  logger.warn(`Unsupported assistant "${value}". Falling back to ${fallback}.`);
  return fallback;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
