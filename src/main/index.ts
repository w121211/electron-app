// src/main/index.ts
import path from "node:path";
import fs from "node:fs/promises";
import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { HttpTrpcServer } from "../core/server/trpc-server.js";
import { requestRendererSnapshot } from "../core/services/chat/pty-chat/pty-snapshot-provider.js";
import {
  createMainProcessContext,
  type MainProcessContext,
} from "./context.js";
import { registerShutdownHooks } from "./lifecycle/shutdown.js";
import { registerDialogIpcHandlers } from "./ipc/dialogs.js";
import { registerQuickPromptIpcHandlers } from "./ipc/quick-prompt.js";
import { registerSurfaceIpcHandlers } from "./ipc/surface.js";
import { registerXtermWindowHandlers } from "./ipc/xterm-window.js";
import { registerPtyIpcHandlers } from "./ipc/pty.js";
import { registerSystemIpcHandlers } from "./ipc/system.js";
import { createPtyAttachmentService } from "./services/pty-attachments.js";
import { createMainWindow } from "./windows/main-window.js";
import { registerQuickPromptWindowShortcut } from "./windows/quick-prompt-window.js";

let context: MainProcessContext | null = null;

async function bootstrap(): Promise<MainProcessContext> {
  electronApp.setAppUserModelId("com.electron");

  const userDataDir = path.join(app.getPath("userData"), "user-data");
  await fs.mkdir(userDataDir, { recursive: true });

  const appResourcesPath = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath();

  const trpcServer = new HttpTrpcServer({
    userDataDir,
    snapshotProvider: requestRendererSnapshot,
    appResourcesPath,
  });

  try {
    const port = await trpcServer.start(3333);
    console.log(`tRPC server started on port ${port}`);
  } catch (error) {
    console.error("Failed to start tRPC server:", error);
    throw error;
  }

  const ptyInstanceManager = trpcServer.getPtyInstanceManager();
  const mainContext = createMainProcessContext({
    trpcServer,
    ptyInstanceManager,
    userDataDir,
  });

  registerShutdownHooks(mainContext);
  registerSystemIpcHandlers(mainContext);
  registerDialogIpcHandlers();

  const attachmentService = createPtyAttachmentService(
    mainContext.ptyInstanceManager,
  );
  registerPtyIpcHandlers(mainContext, attachmentService);
  registerSurfaceIpcHandlers();
  registerQuickPromptIpcHandlers(mainContext);
  registerXtermWindowHandlers(mainContext);
  registerQuickPromptWindowShortcut(mainContext);

  createMainWindow(mainContext);

  return mainContext;
}

app
  .whenReady()
  .then(async () => {
    context = await bootstrap();
  })
  .catch((error) => {
    console.error("Failed to bootstrap main process:", error);
    app.quit();
  });

app.on("activate", () => {
  if (!context) {
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(context);
  }
});

app.on("browser-window-created", (_, window) => {
  optimizer.watchWindowShortcuts(window);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
