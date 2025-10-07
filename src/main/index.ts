// src/main/index.ts
import path from "node:path";
import fs from "node:fs/promises";
import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { HttpTrpcServer } from "../core/server/trpc-server.js";
import { type PtyInstanceManager } from "../core/services/pty/pty-instance-manager.js";
import type {
  SnapshotProvider,
  SnapshotTriggerKind,
} from "../core/services/pty/pty-chat-client.js";

// Global server instance
let trpcServer: HttpTrpcServer;
let ptyInstanceManager: PtyInstanceManager;

// Track per-session attachments per WebContents to prevent duplicate forwarding
const ptyAttachments = new Map<
  string,
  Map<number, { offData: () => void; offExit: () => void }>
>();

interface SnapshotRequestPayload {
  requestId: string;
  sessionId: string;
  ptyInstanceId: string;
  trigger: SnapshotTriggerKind;
}

interface SnapshotResponsePayload {
  requestId: string;
  snapshot?: string | null;
}

const pendingSnapshotRequests = new Map<
  string,
  { resolve: (value: string | null) => void; timer: NodeJS.Timeout }
>();

const requestRendererSnapshot: SnapshotProvider = async ({
  session,
  event,
}) => {
  const ptyInstanceId = session.ptyInstanceId;
  if (!ptyInstanceId) {
    return null;
  }

  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    return null;
  }

  const requestId = randomUUID();

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      pendingSnapshotRequests.delete(requestId);
      resolve(null);
    }, 250);

    pendingSnapshotRequests.set(requestId, { resolve, timer });

    const payload: SnapshotRequestPayload = {
      requestId,
      sessionId: session.id,
      ptyInstanceId,
      trigger: event.kind,
    };

    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send("pty:snapshot-request", payload);
      }
    }
  });
};

function attachPtyToWebContents(ptyId: string, sender: WebContents): boolean {
  const ptyInstance = ptyInstanceManager.getSession(ptyId);
  if (!ptyInstance) {
    console.error(`PTY session not found for ID: ${ptyId}`);
    return false;
  }

  const senderId = sender.id;
  let perSender = ptyAttachments.get(ptyId);
  if (!perSender) {
    perSender = new Map();
    ptyAttachments.set(ptyId, perSender);
  }

  // If already attached for this sender, unsubscribe first to avoid duplicates
  const existing = perSender.get(senderId);
  if (existing) {
    existing.offData();
    existing.offExit();
  }

  const offData = ptyInstance.onData((data) => {
    if (!sender.isDestroyed()) {
      sender.send("pty:data", ptyInstance.id, data);
    }
  });

  const offExit = ptyInstance.onExit(({ exitCode, signal }) => {
    if (!sender.isDestroyed()) {
      sender.send("pty:exit", ptyInstance.id, exitCode, signal);
    }
  });

  perSender.set(senderId, { offData, offExit });

  const cleanup = () => {
    const entry = perSender?.get(senderId);
    if (entry) {
      entry.offData();
      entry.offExit();
      perSender?.delete(senderId);
    }
  };

  sender.once("destroyed", cleanup);
  sender.on("render-process-gone", cleanup);
  sender.on("did-start-navigation", cleanup);

  return true;
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", async () => {
    mainWindow.show();

    // Open DevTools in development
    if (is.dev) {
      mainWindow.webContents.openDevTools();
    }

    // Take screenshot when app is ready (development only)
    // if (is.dev) {
    //     // Wait a bit for the app to fully render
    //     setTimeout(async () => {
    //       const screenshot = await mainWindow.webContents.capturePage();
    //       const screenshotPath = path.join(
    //         process.cwd(),
    //         "screenshots",
    //         `app-screenshot-${Date.now()}.png`,
    //       );
    //       await fs.writeFile(screenshotPath, screenshot.toPNG());
    //       console.log(`Screenshot saved to: ${screenshotPath}`);
    //     }, 2000); // 2 second delay to ensure full render
    // }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Use Electron's userData directory by default and ensure it exists
  const userDataDir = path.join(app.getPath("userData"), "user-data");
  await fs.mkdir(userDataDir, { recursive: true });

  // Start embedded tRPC server
  try {
    trpcServer = new HttpTrpcServer({
      userDataDir,
      snapshotProvider: requestRendererSnapshot,
    });
    const port = await trpcServer.start(3333); // Prefer port 3333, fallback to any available
    console.log(`tRPC server started on port ${port}`);

    // Get PTY instance manager from tRPC server
    ptyInstanceManager = trpcServer.getPtyInstanceManager();
  } catch (error) {
    console.error("Failed to start tRPC server:", error);
    app.quit();
    return;
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC handlers
  ipcMain.on("ping", () => console.log("pong"));

  ipcMain.handle("get-trpc-url", () => {
    return trpcServer?.getTrpcUrl() || null;
  });

  ipcMain.handle("get-platform-info", () => {
    return {
      platform: process.platform,
      cwd: process.cwd(),
    };
  });

  ipcMain.on(
    "pty:snapshot-response",
    (_event, payload: SnapshotResponsePayload) => {
      const entry = pendingSnapshotRequests.get(payload.requestId);
      if (!entry) {
        return;
      }
      pendingSnapshotRequests.delete(payload.requestId);
      clearTimeout(entry.timer);
      const snapshot =
        typeof payload.snapshot === "string" ? payload.snapshot : null;
      entry.resolve(snapshot);
    },
  );

  ipcMain.handle("show-open-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Project Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("show-in-folder", async (_, filePath: string) => {
    return shell.showItemInFolder(filePath);
  });

  // Create a new PTY session and return its id
  ipcMain.handle(
    "pty:create",
    async (
      _,
      options: { cols?: number; rows?: number; cwd?: string; shell?: string },
    ) => {
      const instance = ptyInstanceManager.create({
        cols: options?.cols,
        rows: options?.rows,
        cwd: options?.cwd,
        shell: options?.shell,
      });
      return instance.id;
    },
  );

  // Create and attach in one go to avoid dropping initial output
  ipcMain.handle(
    "pty:createAndAttach",
    async (
      event,
      options: { cols?: number; rows?: number; cwd?: string; shell?: string },
    ) => {
      const instance = ptyInstanceManager.create({
        cols: options?.cols,
        rows: options?.rows,
        cwd: options?.cwd,
        shell: options?.shell,
      });
      attachPtyToWebContents(instance.id, event.sender);
      return instance.id;
    },
  );

  // Pty IPC handlers
  ipcMain.handle("pty:attach", (event, sessionId: string) => {
    return attachPtyToWebContents(sessionId, event.sender);
  });

  ipcMain.handle("pty:write", async (_, sessionId: string, data: string) => {
    const session = ptyInstanceManager.getSession(sessionId);
    if (session) {
      session.write(data);
      return true;
    }
    return false;
  });

  ipcMain.handle(
    "pty:resize",
    async (_, sessionId: string, options: { cols: number; rows: number }) => {
      const session = ptyInstanceManager.getSession(sessionId);
      if (session) {
        session.resize(options.cols, options.rows);
        return true;
      }
      return false;
    },
  );

  ipcMain.handle("pty:destroy", async (_, sessionId: string) => {
    const session = ptyInstanceManager.getSession(sessionId);
    if (session) {
      session.kill();
      return true;
    }
    return false;
  });

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle app quit to clean up resources
let quitting = false;
app.on("before-quit", async (event) => {
  if (quitting) {
    return; // Prevent re-entry
  }
  event.preventDefault(); // Prevent immediate quit
  quitting = true;

  try {
    console.log("Gracefully shutting down...");

    if (ptyInstanceManager) {
      await ptyInstanceManager.destroyAll();
      console.log("All PTY instances destroyed.");
    }

    if (trpcServer) {
      await trpcServer.stop();
      console.log("tRPC server stopped.");
    }

    console.log("Cleanup complete.");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    app.quit(); // Now quit the app
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
