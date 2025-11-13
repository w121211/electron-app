// src/core/server/websocket-server.ts
import { WebSocketServer as WsServer, WebSocket } from "ws";
import { ILogObj, Logger } from "tslog";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type {
  ExtensionMessage,
  ServerMessage,
} from "../services/external-chat/websocket-protocol.js";

const logger: Logger<ILogObj> = new Logger({ name: "WebSocketServer" });

interface WebSocketServerConfig {
  port?: number;
}

type ConnectionListener = (state: "connected" | "disconnected") => void;
type MessageListener = (message: ExtensionMessage) => void;
type ErrorListener = (error: unknown) => void;

export class WebSocketServer {
  private wss: WsServer | null = null;
  private server: Server | null = null;
  private port: number = 0;
  private activeSocket: WebSocket | null = null;

  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(private config: WebSocketServerConfig) {}

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

  async start(preferredPort: number = 0): Promise<number> {
    if (this.wss) {
      logger.warn("WebSocket server is already running");
      return this.port;
    }

    logger.info("Starting WebSocket server...");

    this.server = createServer();
    const port = this.config.port ?? preferredPort;
    const actualPort = await this.findAvailablePort(port);

    this.wss = new WsServer({ server: this.server });
    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));

    return new Promise<number>((resolve, reject) => {
      this.server?.listen(actualPort, "127.0.0.1", () => {
        this.port = actualPort;
        logger.info(
          `WebSocket server listening on ws://127.0.0.1:${this.port}`,
        );
        resolve(this.port);
      });

      this.server?.on("error", (error: any) => {
        logger.error("Failed to start WebSocket server:", error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) {
      return;
    }

    logger.info("Stopping WebSocket server...");
    return new Promise((resolve) => {
      this.wss?.close(() => {
        this.server?.close(() => {
          this.wss = null;
          this.server = null;
          this.port = 0;
          this.activeSocket = null;
          logger.info("WebSocket server stopped");
          resolve();
        });
      });
    });
  }

  send(message: ServerMessage): void {
    if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot send message: no active WebSocket connection.");
    }

    logger.debug("Sending WS message:", message);
    const payload = JSON.stringify(message);
    this.activeSocket.send(payload);
  }

  broadcast(data: string): void {
    if (!this.wss) {
      logger.warn("WebSocket server not running, cannot broadcast.");
      return;
    }

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private handleConnection(socket: WebSocket): void {
    logger.info("WebSocket client connected");
    this.activeSocket = socket;
    this.notifyConnection("connected");

    socket.on("message", (message) => {
      this.handleRawMessage(message.toString());
    });

    socket.on("close", () => {
      logger.info("WebSocket client disconnected");
      if (this.activeSocket === socket) {
        this.activeSocket = null;
      }
      this.notifyConnection("disconnected");
    });

    socket.on("error", (error) => {
      logger.error("WebSocket error:", error);
      this.notifyError(error);
    });
  }

  private handleRawMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      logger.warn("Received invalid JSON from WebSocket client:", raw);
      this.notifyError(error);
      return;
    }

    const normalized = this.normalizeMessage(parsed);
    if (!normalized) {
      logger.warn(
        "Received unsupported message from WebSocket client:",
        parsed,
      );
      return;
    }

    logger.debug("Received WS message:", normalized);
    this.messageListeners.forEach((listener) => listener(normalized));
  }

  private normalizeMessage(data: unknown): ExtensionMessage | null {
    if (!data || typeof data !== "object") {
      return null;
    }

    const base = data as { type?: string };
    if (!base.type) {
      return null;
    }

    switch (base.type) {
      case "connection:status":
      case "connection:error":
        return data as ExtensionMessage;
      case "ws:submit-prompt-result":
      case "ws:run-tests-result":
      case "ws:error":
        return data as ExtensionMessage;
      case "ws:watch-page-update": {
        const payload = (data as any).payload;
        if (payload?.timestamp) {
          payload.timestamp = new Date(payload.timestamp);
        } else {
          payload.timestamp = new Date();
        }
        return {
          ...(data as ExtensionMessage),
          payload,
        };
      }
      default:
        return null;
    }
  }

  private notifyConnection(state: "connected" | "disconnected"): void {
    this.connectionListeners.forEach((listener) => listener(state));
  }

  private notifyError(error: unknown): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  private async findAvailablePort(preferredPort: number): Promise<number> {
    const net = await import("net");

    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.listen(preferredPort, () => {
        const port = (server.address() as any)?.port;
        server.close(() => {
          resolve(port);
        });
      });

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          const fallbackServer = net.createServer();
          fallbackServer.listen(0, () => {
            const port = (fallbackServer.address() as any)?.port;
            fallbackServer.close(() => {
              resolve(port);
            });
          });
          fallbackServer.on("error", reject);
        } else {
          reject(err);
        }
      });
    });
  }
}
