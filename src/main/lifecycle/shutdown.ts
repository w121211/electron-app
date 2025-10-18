// src/main/lifecycle/shutdown.ts
import { app, BrowserWindow, globalShortcut } from "electron";
import type { MainProcessContext } from "../context.js";

export function registerShutdownHooks(context: MainProcessContext): void {
  app.on("before-quit", async (event) => {
    if (context.isQuitting()) {
      return;
    }

    event.preventDefault();
    context.setQuitting(true);

    try {
      console.log("Gracefully shutting down...");
      globalShortcut.unregisterAll();

      await context.ptyInstanceManager.destroyAll();
      console.log("All PTY instances destroyed.");

      await context.trpcServer.stop();
      console.log("tRPC server stopped.");

      console.log("Cleanup complete.");
    } catch (error) {
      console.error("Error during shutdown:", error);
    } finally {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }
      app.exit(0);
    }
  });
}
