// src/main/windows/xterm-window.ts
import { BrowserWindow } from "electron";
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";

export function createXtermWindow(ptySessionId: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  win.on("ready-to-show", () => {
    win.show();
  });

  const urlHash = `ptySessionId=${ptySessionId}`;

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/windows/xterm-window/index.html#${urlHash}`,
    );
    win.webContents.openDevTools();
  } else {
    win.loadFile(
      join(__dirname, "../renderer/windows/xterm-window/index.html"),
      { hash: urlHash },
    );
  }

  return win;
}
