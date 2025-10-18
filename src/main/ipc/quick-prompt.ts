// src/main/ipc/quick-prompt.ts
import { dialog, ipcMain } from "electron";
import type { MainProcessContext } from "../context.js";
import {
  toggleQuickPromptWindow,
  showQuickPromptWindow,
  hideQuickPromptWindow,
  focusQuickPromptWindow,
} from "../windows/quick-prompt-window.js";

export function registerQuickPromptIpcHandlers(
  context: MainProcessContext,
): void {
  ipcMain.handle("quick-prompt-window:toggle", () => {
    toggleQuickPromptWindow(context);
    const quickPromptWindow = context.getQuickPromptWindow();
    return quickPromptWindow?.isVisible() ?? false;
  });

  ipcMain.handle("quick-prompt-window:show", () => {
    return showQuickPromptWindow(context);
  });

  ipcMain.handle("quick-prompt-window:hide", () => {
    return hideQuickPromptWindow(context);
  });

  ipcMain.handle("quick-prompt-window:focus", () => {
    return focusQuickPromptWindow(context);
  });

  ipcMain.handle("main-window:focus", () => {
    const mainWindow = context.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      return true;
    }
    return false;
  });

  ipcMain.handle(
    "quick-prompt:launch-chat",
    (
      _,
      payload: {
        scriptPath: string;
        sessionId: string;
        projectPath: string;
        modelId: `${string}/${string}`;
      },
    ) => {
      const quickPromptWindow = context.getQuickPromptWindow();
      if (quickPromptWindow && !quickPromptWindow.isDestroyed()) {
        quickPromptWindow.hide();
      }

      const mainWindow = context.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.focus();
        mainWindow.webContents.send("quick-prompt:launch-chat", payload);
        return true;
      }

      return false;
    },
  );

  ipcMain.handle(
    "quick-prompt:select-files",
    async (
      _,
      options?:
        | {
            defaultPath?: string;
          }
        | undefined,
    ) => {
      const result = await dialog.showOpenDialog({
        title: "Select files to reference",
        defaultPath: options?.defaultPath,
        properties: ["openFile", "multiSelections", "dontAddToRecent"],
      });

      if (result.canceled) {
        return [];
      }

      return result.filePaths;
    },
  );
}
