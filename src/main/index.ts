// src/main/index.ts
import path from "node:path";
import fs from "node:fs/promises";
import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { HttpTrpcServer } from "../core/server/trpc-server.js";
import { type PtyInstanceManager } from "../core/services/pty/pty-instance-manager.js";

// Global server instance
let trpcServer: HttpTrpcServer;
let ptyInstanceManager: PtyInstanceManager;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 1800,
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
    //   try {
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
    //   } catch (error) {
    //     console.error("Failed to take screenshot:", error);
    //   }
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
    trpcServer = new HttpTrpcServer({ userDataDir });
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

  // Pty IPC handlers
  ipcMain.handle("pty:attach", (event, sessionId: string) => {
    const ptyInstance = ptyInstanceManager.getSession(sessionId);
    if (!ptyInstance) {
      console.error(`PTY session not found for ID: ${sessionId}`);
      return false;
    }

    // Forward events from this specific pty instance to the renderer window that attached
    const onDataUnsubscribe = ptyInstance.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("pty:data", ptyInstance.id, data);
      }
    });

    const onExitUnsubscribe = ptyInstance.onExit(({ exitCode, signal }) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("pty:exit", ptyInstance.id, exitCode, signal);
      }
    });

    // When the renderer window is closed, unsubscribe from PTY events
    event.sender.once("destroyed", () => {
      onDataUnsubscribe();
      onExitUnsubscribe();
    });

    event.sender.on("render-process-gone", () => {
      onDataUnsubscribe();
      onExitUnsubscribe();
    });

    event.sender.on("did-start-navigation", () => {
      onDataUnsubscribe();
      onExitUnsubscribe();
    });

    return true;
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
