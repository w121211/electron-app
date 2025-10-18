// src/main/ipc/system.ts
import { ipcMain } from "electron";
import type { MainProcessContext } from "../context.js";

export function registerSystemIpcHandlers(
  context: MainProcessContext,
): void {
  ipcMain.on("ping", () => {
    console.log("pong");
  });

  ipcMain.handle("get-trpc-url", () => {
    return context.trpcServer.getTrpcUrl() || null;
  });

  ipcMain.handle("get-platform-info", () => {
    return {
      platform: process.platform,
      cwd: process.cwd(),
    };
  });
}
