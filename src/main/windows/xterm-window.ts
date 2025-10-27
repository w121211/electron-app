// src/main/windows/xterm-window.ts
import { BrowserWindow } from "electron";
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import type { MainProcessContext } from "../context.js";
import { Logger } from "tslog";

const logger = new Logger({ name: "XtermWindow" });

export function createXtermWindow(
  ptySessionId: string,
  context: MainProcessContext,
): BrowserWindow {
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

  win.on("closed", () => {
    logger.info(
      `Xterm window closed, cleaning up PTY session: ${ptySessionId}`,
    );
    const session = context.ptyInstanceManager.getSession(ptySessionId);
    if (session) {
      session.kill();
      logger.info(`PTY session ${ptySessionId} killed`);
    } else {
      logger.warn(
        `PTY session ${ptySessionId} not found during window cleanup`,
      );
    }
  });

  const urlHash = `ptySessionId=${ptySessionId}`;

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/src/windows/xterm-window/index.html#${urlHash}`,
    );
    win.webContents.openDevTools();
  } else {
    win.loadFile(
      join(__dirname, "../renderer/src/windows/xterm-window/index.html"),
      { hash: urlHash },
    );
  }

  return win;
}
