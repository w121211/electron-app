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
  mainWindow: {
    focus: () => ipcRenderer.invoke("main-window:focus"),
  },
  quickPromptWindow: {
    toggle: () => ipcRenderer.invoke("quick-prompt-window:toggle"),
    show: () => ipcRenderer.invoke("quick-prompt-window:show"),
    hide: () => ipcRenderer.invoke("quick-prompt-window:hide"),
    focus: () => ipcRenderer.invoke("quick-prompt-window:focus"),
  },
  quickPrompt: {
    launchChat: (payload: {
      scriptPath: string;
      sessionId: string;
      projectPath: string;
      modelId: `${string}/${string}`;
    }) => ipcRenderer.invoke("quick-prompt:launch-chat", payload),
    selectFiles: (options?: { defaultPath?: string }) =>
      ipcRenderer.invoke("quick-prompt:select-files", options),
    onLaunch: (
      callback: (payload: {
        scriptPath: string;
        sessionId: string;
        projectPath: string;
        modelId: `${string}/${string}`;
      }) => void,
    ) => {
      const handler = (
        _: unknown,
        payload: {
          scriptPath: string;
          sessionId: string;
          projectPath: string;
          modelId: `${string}/${string}`;
        },
      ) => callback(payload);
      ipcRenderer.on("quick-prompt:launch-chat", handler);
      return () => {
        ipcRenderer.removeListener("quick-prompt:launch-chat", handler);
      };
    },
  },
  // Pty APIs
  pty: {
    createAndAttach: (options: {
      cols?: number;
      rows?: number;
      cwd?: string;
      shell?: string;
    }) => ipcRenderer.invoke("pty:createAndAttach", options),
    create: (options: {
      cols?: number;
      rows?: number;
      cwd?: string;
      shell?: string;
    }) => ipcRenderer.invoke("pty:create", options),
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
    onSnapshotRequest: (
      callback: (payload: {
        requestId: string;
        sessionId: string;
        ptyInstanceId: string;
        trigger: string;
      }) => void,
    ) => {
      const handler = (
        _: unknown,
        payload: {
          requestId: string;
          sessionId: string;
          ptyInstanceId: string;
          trigger: string;
        },
      ) => callback(payload);
      ipcRenderer.on("pty:snapshot-request", handler);
      return () => {
        ipcRenderer.removeListener("pty:snapshot-request", handler);
      };
    },
    sendSnapshotResponse: (payload: {
      requestId: string;
      snapshot?: string | null;
    }) => {
      ipcRenderer.send("pty:snapshot-response", payload);
    },
    requestSnapshotForTests: (context: {
      session: { id: string; ptyInstanceId?: string | null };
      processor: unknown;
      event: { kind: string };
    }): Promise<string | null | undefined> => {
      if (process.env.PTY_EXPOSE_SNAPSHOT_PROVIDER !== "1") {
        throw new Error("Test snapshot IPC is unavailable");
      }
      return ipcRenderer.invoke(
        "test:pty:request-renderer-snapshot",
        context,
      );
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
