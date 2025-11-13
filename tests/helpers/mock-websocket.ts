// tests/helpers/mock-websocket.ts
import type {
  ExtensionMessage,
  ServerMessage,
} from "../../src/core/services/external-chat/websocket-protocol.js";

type ConnectionListener = (state: "connected" | "disconnected") => void;
type MessageListener = (message: ExtensionMessage) => void;
type ErrorListener = (error: unknown) => void;
type ServerMessageListener = (message: ServerMessage) => void;

export class MockWebSocketServer {
  private client: MockWebSocketClient | null = null;
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  connect(): MockWebSocketClient {
    if (this.client) {
      throw new Error("Mock WebSocket client already connected");
    }
    this.client = new MockWebSocketClient(this);
    this.emitConnection("connected");
    return this.client;
  }

  disconnect(): void {
    if (!this.client) {
      return;
    }
    this.client = null;
    this.emitConnection("disconnected");
  }

  send(message: ServerMessage): void {
    if (!this.client) {
      throw new Error("Cannot send WS message without a connected client");
    }
    this.client.receive(message);
  }

  broadcast(data: string): void {
    if (!this.client) {
      return;
    }
    const parsed = JSON.parse(data) as ServerMessage;
    this.client.receive(parsed);
  }

  receiveFromClient(message: ExtensionMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  emitError(error: unknown): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private emitConnection(state: "connected" | "disconnected"): void {
    for (const listener of this.connectionListeners) {
      listener(state);
    }
  }
}

export class MockWebSocketClient {
  private readonly messageListeners = new Set<ServerMessageListener>();

  constructor(private readonly server: MockWebSocketServer) {}

  send(message: ExtensionMessage): void {
    this.server.receiveFromClient(message);
  }

  close(): void {
    this.server.disconnect();
  }

  onMessage(listener: ServerMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  receive(message: ServerMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

export function createMockWebSocketPair(options?: {
  autoConnect?: boolean;
}): {
  server: MockWebSocketServer;
  client: MockWebSocketClient | null;
  connect: () => MockWebSocketClient;
} {
  const server = new MockWebSocketServer();
  const connect = () => server.connect();
  const client = options?.autoConnect === false ? null : connect();
  return { server, client, connect };
}
