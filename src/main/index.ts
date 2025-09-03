// src/main/index.ts
import path from "node:path";
import fs from "node:fs/promises";
import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { HttpTrpcServer } from "../core/server/trpc-server.js";

// Global server instance
let trpcServer: HttpTrpcServer | null = null;

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

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();

    // Open DevTools in development
    if (is.dev) {
      mainWindow.webContents.openDevTools();
    }
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
  } catch (error) {
    console.error("Failed to start tRPC server:", error);
    app.quit();
    return;
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC handlers
  ipcMain.handle("get-trpc-url", () => {
    return trpcServer?.getTrpcUrl() || null;
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

  ipcMain.on("ping", () => console.log("pong"));

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
    // Stop tRPC server before quitting
    if (trpcServer) {
      await trpcServer.stop();
    }
    app.quit();
  }
});

// Handle app quit to clean up resources
app.on("before-quit", async () => {
  if (trpcServer) {
    await trpcServer.stop();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
