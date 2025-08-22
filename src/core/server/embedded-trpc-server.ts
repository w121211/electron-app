// src/core/server/embed-server.ts
import path from "node:path";
import fs from "node:fs/promises";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { app } from "electron";
import { ILogObj, Logger } from "tslog";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { createAppRouter } from "./root-router.js";

const logger: Logger<ILogObj> = new Logger({ name: "EmbeddedServer" });

// Create context type
function createContext(_opts: CreateHTTPContextOptions) {
  return {};
}

interface ServerConfig {
  port?: number;
  userDataDir?: string;
}

export class EmbeddedTrpcServer {
  private server: any = null;
  private port: number = 0;
  private userDataDir: string;

  constructor(config: ServerConfig = {}) {
    // Use Electron's userData directory by default
    this.userDataDir =
      config.userDataDir ?? path.join(app.getPath("userData"), "app-data");

    logger.info(`Using user data directory: ${this.userDataDir}`);

    // Ensure user data directory exists
    fs.mkdir(this.userDataDir, { recursive: true });
  }

  async start(preferredPort: number = 0): Promise<number> {
    if (this.server) {
      logger.warn("Server is already running");
      return this.port;
    }

    try {
      logger.info("Starting embedded tRPC server...");

      // Create the app router
      const appRouter = await createAppRouter(this.userDataDir);

      // Create HTTP server with tRPC handler (no CORS needed for Electron)
      this.server = createHTTPServer({
        middleware: cors(),
        router: appRouter,
        createContext,
        basePath: "/api/trpc/",
      });

      // Find available port
      const actualPort = await this.findAvailablePort(preferredPort);

      return new Promise<number>((resolve, reject) => {
        this.server.listen(actualPort, "127.0.0.1", () => {
          this.port = actualPort;
          logger.info(
            `Embedded tRPC server listening on http://127.0.0.1:${this.port}`,
          );
          logger.info(`tRPC endpoint: http://127.0.0.1:${this.port}/api/trpc`);
          resolve(this.port);
        });

        this.server.on("error", (error: any) => {
          logger.error("Failed to start embedded server:", error);
          reject(error);
        });
      });
    } catch (error) {
      logger.error("Failed to initialize embedded server:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise<void>((resolve) => {
      logger.info("Stopping embedded tRPC server...");
      this.server.close(() => {
        this.server = null;
        this.port = 0;
        logger.info("Embedded tRPC server stopped");
        resolve();
      });
    });
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
