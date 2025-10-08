// src/core/server/http-server.ts
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { ILogObj, Logger } from "tslog";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { createContext } from "./trpc-init.js";
import { createTrpcRouter } from "./root-router.js";
import type { IEventBus } from "../event-bus.js";
import { createServerEventBus } from "../event-bus.js";
import { createPtyInstanceManager, type PtyInstanceManager } from "../services/pty/pty-instance-manager.js";
import type { SnapshotProvider } from "../services/pty/pty-chat-client.js";
import type { FileWatcherService } from "../services/file-watcher-service.js";

const logger: Logger<ILogObj> = new Logger({ name: "HttpTrpcServer" });

interface ServerConfig {
  port?: number;
  userDataDir: string;
  snapshotProvider?: SnapshotProvider;
}

export class HttpTrpcServer {
  private server: Server | null = null;
  private port: number = 0;
  private userDataDir: string;
  private eventBus: IEventBus;
  private ptyInstanceManager: PtyInstanceManager;
  private fileWatcherService: FileWatcherService | null = null;
  private snapshotProvider?: SnapshotProvider;
  private readonly connections = new Set<Socket>();

  constructor(config: ServerConfig) {
    this.userDataDir = config.userDataDir;
    this.eventBus = createServerEventBus({ logger });
    this.ptyInstanceManager = createPtyInstanceManager(this.eventBus);
    this.snapshotProvider = config.snapshotProvider;
    logger.info(`Using user data directory: ${this.userDataDir}`);
  }

  async start(preferredPort: number = 0): Promise<number> {
    if (this.server) {
      logger.warn("Server is already running");
      return this.port;
    }

    logger.info("Starting embedded tRPC server...");

    // Create the app router
    const { router: trpcRouter, fileWatcherService } = await createTrpcRouter({
      userDataDir: this.userDataDir,
      eventBus: this.eventBus,
      ptyInstanceManager: this.ptyInstanceManager,
      snapshotProvider: this.snapshotProvider,
    });
    this.fileWatcherService = fileWatcherService;

    // Create HTTP server with tRPC handler (no CORS needed for Electron)
    this.server = createHTTPServer({
      middleware: cors(),
      router: trpcRouter,
      createContext,
      basePath: "/api/trpc/",
    });

    this.server.on("connection", (socket: Socket) => {
      this.connections.add(socket);
      socket.on("close", () => {
        this.connections.delete(socket);
      });
    });

    // Find available port
    const actualPort = await this.findAvailablePort(preferredPort);

    const server = this.server;
    if (!server) {
      throw new Error("HTTP server was not initialized");
    }

    return new Promise<number>((resolve, reject) => {
      server.listen(actualPort, "127.0.0.1", () => {
        this.port = actualPort;
        logger.info(
          `Http tRPC server listening on http://127.0.0.1:${this.port}`,
        );
        logger.info(`tRPC endpoint: http://127.0.0.1:${this.port}/api/trpc`);
        resolve(this.port);
      });

      server.on("error", (error: any) => {
        logger.error("Failed to start http server:", error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      await this.shutdownFileWatchers();
      return;
    }

    logger.info("Stopping embedded tRPC server...");

    const server = this.server;

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          this.server = null;
          this.port = 0;
          logger.info("Embedded tRPC server stopped");
          resolve();
        });

        const closeIdleConnections = (server as any)
          .closeIdleConnections as ((this: Server) => void) | undefined;
        const closeAllConnections = (server as any)
          .closeAllConnections as ((this: Server) => void) | undefined;

        closeIdleConnections?.call(server);
        closeAllConnections?.call(server);

        for (const socket of this.connections) {
          socket.destroy();
        }
      });
    } finally {
      this.connections.clear();
      await this.shutdownFileWatchers();
    }
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  getTrpcUrl(): string {
    return `${this.getBaseUrl()}/api/trpc`;
  }

  getEventBus(): IEventBus {
    return this.eventBus;
  }

  getPtyInstanceManager(): PtyInstanceManager {
    return this.ptyInstanceManager;
  }

  private async shutdownFileWatchers(): Promise<void> {
    if (!this.fileWatcherService) {
      return;
    }

    await this.fileWatcherService.stopAllWatchers();
    logger.info("All file watchers stopped");
    this.fileWatcherService = null;
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
