// src/main/windows/main-window.ts
import { BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";
import type { MainProcessContext } from "../context.js";

export function createMainWindow(context: MainProcessContext): BrowserWindow {
  const existing = context.getMainWindow();
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const window = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  context.setMainWindow(window);

  window.on("ready-to-show", () => {
    window.show();
    if (is.dev) {
      window.webContents.openDevTools();
    }
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  window.on("closed", () => {
    context.setMainWindow(null);
  });

  return window;
}
