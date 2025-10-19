// src/preload/index.d.ts
import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    // api: unknown
    api: {
      getTrpcUrl: () => Promise<string | null>;
      getPlatformInfo: () => Promise<{ platform: string; cwd: string }>;
      showOpenDialog: () => Promise<string | null>;
      showInFolder: (filePath: string) => Promise<void>;
      mainWindow: {
        focus: () => Promise<boolean>;
      };
      quickPromptWindow: {
        toggle: () => Promise<boolean>;
        show: () => Promise<boolean>;
        hide: () => Promise<boolean>;
        focus: () => Promise<boolean>;
      };
      quickPrompt: {
        launchChat: (payload: {
          scriptPath: string;
          sessionId: string;
          projectPath: string | null;
          modelId: `${string}/${string}`;
        }) => Promise<boolean>;
        selectFiles: (options?: { defaultPath?: string }) => Promise<string[]>;
        onLaunch: (
          callback: (payload: {
            scriptPath: string;
            sessionId: string;
            projectPath: string | null;
            modelId: `${string}/${string}`;
          }) => void,
        ) => () => void;
      };
      pty: {
        createAndAttach: (options: {
          cols?: number;
          rows?: number;
          cwd?: string;
          shell?: string;
        }) => Promise<string>;
        create: (options: {
          cols?: number;
          rows?: number;
          cwd?: string;
          shell?: string;
        }) => Promise<string>;
        attach: (sessionId: string) => Promise<boolean>;
        write: (sessionId: string, data: string) => Promise<boolean>;
        resize: (
          sessionId: string,
          options: { cols: number; rows: number },
        ) => Promise<boolean>;
        destroy: (sessionId: string) => Promise<boolean>;
        onData: (callback: (sessionId: string, data: string) => void) => () => void;
        onExit: (
          callback: (
            sessionId: string,
            exitCode: number,
            signal?: number,
          ) => void,
        ) => () => void;
        onSnapshotRequest: (
          callback: (payload: {
            requestId: string;
            sessionId: string;
            ptyInstanceId: string;
            trigger: string;
          }) => void,
        ) => () => void;
        sendSnapshotResponse: (payload: {
          requestId: string;
          snapshot?: string | null;
        }) => void;
        requestSnapshotForTests: (context: {
          session: { id: string; ptyInstanceId?: string | null };
          processor: unknown;
          event: { kind: string };
        }) => Promise<string | null | undefined>;
      };
    };
  }
}
