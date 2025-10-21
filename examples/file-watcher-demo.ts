// ```
// $ pnpm tsx file-watcher-demo.ts
// ```

import fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "tslog";
import { createServerEventBus } from "../src/event-bus.js";
import { createFileWatcher } from "../src/file-watcher-service.js";
import { ServerFileWatcherEvent } from "../src/event-types.js";

// Create a logger for the demo
const logger = new Logger({ name: "FileWatcherDemo" });

// Define the workspace path for demo files
const demoWorkspacePath = path.join(process.cwd(), "workspace");

// Create initial folder structure for the demo
async function setupWorkspace(): Promise<void> {
  await fs.mkdir(demoWorkspacePath, { recursive: true });



  logger.info(`Demo workspace created at ${demoWorkspacePath}`);
}



// Clean up demo files
async function cleanupWorkspace(): Promise<void> {
  await fs.rm(demoWorkspacePath, { recursive: true, force: true });
  logger.info("Demo workspace cleaned up");
}

// Run the demo
async function runDemo(): Promise<void> {
  logger.info("Starting File Watcher Demo");

  // Create the event bus
  const eventBus = createServerEventBus();

  // Subscribe to file system events
  const unsubscribe = eventBus.subscribe<ServerFileWatcherEvent>(
    "ServerFileWatcherEvent",
    (event) => {
      logger.info(
        `File event: ${event.data.chokidarEvent} | ${event.data.isDirectory ? "Directory" : "File"} | ${event.data.srcPath}`,
      );
    },
  );

  // Set up the workspace
  await setupWorkspace();

  // Create and start the file watcher
  const fileWatcher = createFileWatcher(eventBus, demoWorkspacePath);
  logger.info("File watcher started");



  // Allow time for all events to be processed
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));

  // Clean up
  await fileWatcher.stopWatching();
  unsubscribe();
  await cleanupWorkspace();

  logger.info("Demo completed");
}

// Execute the demo
(async () => {
  await runDemo();
})();
