// src/main/ipc/xterm-window.ts
import { ipcMain } from "electron";
import { createXtermWindow } from "../windows/xterm-window";
import type { MainProcessContext } from "../context";

export function registerXtermWindowHandlers(context: MainProcessContext) {
  ipcMain.handle("xterm-window:launch", (_event, ptySessionId: string) => {
    const win = createXtermWindow(ptySessionId, context);
    context.addXtermWindow(win);
    return true;
  });
}
