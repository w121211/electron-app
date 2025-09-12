// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {
  getTrpcUrl: () => ipcRenderer.invoke("get-trpc-url"),
  showOpenDialog: () => ipcRenderer.invoke("show-open-dialog"),
  showInFolder: (filePath: string) =>
    ipcRenderer.invoke("show-in-folder", filePath),
  // Pty APIs
  pty: {
    create: (options?: any) => ipcRenderer.invoke("pty:create", options),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke("pty:write", sessionId, data),
    resize: (sessionId: string, options: { cols: number; rows: number }) =>
      ipcRenderer.invoke("pty:resize", sessionId, options),
    destroy: (sessionId: string) =>
      ipcRenderer.invoke("pty:destroy", sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      ipcRenderer.on("pty:data", (_, sessionId, data) =>
        callback(sessionId, data),
      );
    },
    onExit: (
      callback: (sessionId: string, exitCode: number, signal?: number) => void,
    ) => {
      ipcRenderer.on("pty:exit", (_, sessionId, exitCode, signal) =>
        callback(sessionId, exitCode, signal),
      );
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners("pty:data");
      ipcRenderer.removeAllListeners("pty:exit");
    },
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
