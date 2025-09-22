// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {
  getTrpcUrl: () => ipcRenderer.invoke("get-trpc-url"),
  getPlatformInfo: () => ipcRenderer.invoke("get-platform-info"),
  showOpenDialog: () => ipcRenderer.invoke("show-open-dialog"),
  showInFolder: (filePath: string) =>
    ipcRenderer.invoke("show-in-folder", filePath),
  // Pty APIs
  pty: {
    attach: (sessionId: string) => ipcRenderer.invoke("pty:attach", sessionId),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke("pty:write", sessionId, data),
    resize: (sessionId: string, options: { cols: number; rows: number }) =>
      ipcRenderer.invoke("pty:resize", sessionId, options),
    destroy: (sessionId: string) =>
      ipcRenderer.invoke("pty:destroy", sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: unknown, sessionId: string, data: string) =>
        callback(sessionId, data);
      ipcRenderer.on("pty:data", handler);
      return () => {
        ipcRenderer.removeListener("pty:data", handler);
      };
    },
    onExit: (
      callback: (sessionId: string, exitCode: number, signal?: number) => void,
    ) => {
      const handler = (
        _: unknown,
        sessionId: string,
        exitCode: number,
        signal?: number,
      ) => callback(sessionId, exitCode, signal);
      ipcRenderer.on("pty:exit", handler);
      return () => {
        ipcRenderer.removeListener("pty:exit", handler);
      };
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
