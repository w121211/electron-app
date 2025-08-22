// src/core/server/start-server.ts
// Run with: `AI_GATEWAY_API_KEY="your_api_key" pnpm tsx --watch src/server/start-server.ts`
import cors from "cors";
import { Logger } from "tslog";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { createTrpcRouter } from "./root-router.js";
import { createContext } from "./trpc-init.js";

const logger = new Logger({ name: "Start-Server" });
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3333;

async function startServer() {
  logger.info("Starting server...");

  try {
    // Get user data directory from environment or use default
    const userDataDir = process.cwd() + "/my-demo-space/user-data";
    const trpcRouter = await createTrpcRouter(userDataDir);

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
    const shutdown = () => {
      logger.info("Shutting down server...");
      server.close();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
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
