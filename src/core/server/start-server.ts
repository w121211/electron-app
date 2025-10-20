// src/core/server/start-server.ts
// Direct run: `AI_GATEWAY_API_KEY="your_api_key" pnpm tsx --watch src/server/start-server.ts`
import cors from "cors";
import { Logger, type ILogObj } from "tslog";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { createTrpcRouter } from "./root-router.js";
import { createContext } from "./trpc-init.js";
import { createServerEventBus } from "../event-bus.js";
import { createPtyInstanceManager } from "../pty/pty-instance-manager.js";
import type { SnapshotProvider } from "../services/chat/pty-chat/pty-chat-client.js";

const logger = new Logger<ILogObj>({ name: "Start-Server" });
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3333;

async function startServer() {
  logger.info("Starting server...");

  try {
    // Get user data directory from environment or use default
    const userDataDir = process.cwd() + "/my-demo-space/user-data";

    // Create dependencies
    const eventBus = createServerEventBus({ logger });
    const ptyInstanceManager = createPtyInstanceManager(eventBus);
    const snapshotProvider: SnapshotProvider = async () => null;

    const { router: trpcRouter, fileWatcherService } = await createTrpcRouter({
      userDataDir,
      eventBus,
      ptyInstanceManager,
      snapshotProvider,
    });

    // Create HTTP server with tRPC handler
    const server = createHTTPServer({
      middleware: cors(),
      router: trpcRouter,
      createContext,
      basePath: "/api/trpc/",
    });

    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server listening on http://localhost:${PORT}`);
      logger.info(
        `tRPC endpoint available at http://localhost:${PORT}/api/trpc`,
      );
    });

    // Handle shutdown
    const shutdown = async () => {
      logger.info("Shutting down server...");
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await fileWatcherService.stopAllWatchers();
      process.exit(0);
    };

    process.on("SIGTERM", () => {
      shutdown().catch((error) => {
        logger.error("Error during shutdown:", error);
        process.exit(1);
      });
    });
    process.on("SIGINT", () => {
      shutdown().catch((error) => {
        logger.error("Error during shutdown:", error);
        process.exit(1);
      });
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.fatal("Fatal server error:", error);
  process.exit(1);
});
