// src/main/ipc/dialogs.ts
import { dialog, ipcMain, shell } from "electron";

export function registerDialogIpcHandlers(): void {
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
}
