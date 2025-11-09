// src/core/server/websocket-server.ts
import { WebSocketServer as WsServer, WebSocket } from "ws";
import { ILogObj, Logger } from "tslog";
import type { Server } from "node:http";
import { createServer } from "node:http";

const logger: Logger<ILogObj> = new Logger({ name: "WebSocketServer" });

interface WebSocketServerConfig {
  port?: number;
}

export class WebSocketServer {
  private wss: WsServer | null = null;
  private server: Server | null = null;
  private port: number = 0;

  constructor(private config: WebSocketServerConfig) {}

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

    this.wss.on("connection", (ws: WebSocket) => {
      logger.info("WebSocket client connected");

      ws.on("message", (message: string) => {
        logger.info(`Received message: ${message}`);
        // Echo message back to client
        ws.send(`Echo: ${message}`);
      });

      ws.on("close", () => {
        logger.info("WebSocket client disconnected");
      });

      ws.on("error", (error) => {
        logger.error("WebSocket error:", error);
      });
    });

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
          logger.info("WebSocket server stopped");
          resolve();
        });
      });
    });
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
          // Try with port 0 to get any available port
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
