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
        showDashboard: () => Promise<boolean>;
        onNavigate: (
          callback: (payload: { target: string }) => void,
        ) => () => void;
      };
      quickPromptWindow: {
        toggle: () => Promise<boolean>;
        show: () => Promise<boolean>;
        hide: () => Promise<boolean>;
        focus: () => Promise<boolean>;
      };
      surface: {
        launch: (payload: {
          sessionId: string;
          modelId: `${string}/${string}`;
          modelSurface: "api" | "terminal" | "web" | "pty";
          projectPath?: string | null;
        }) => Promise<{
          success: boolean;
          pid?: number;
          error?: string;
          message?: string;
        }>;
      };
      quickPrompt: {
        selectFiles: (options?: { defaultPath?: string }) => Promise<string[]>;
        saveAudio: (audioData: Uint8Array) => Promise<string>;
      };
      xtermWindow: {
        launch: (ptySessionId: string) => Promise<boolean>;
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
        onData: (
          callback: (sessionId: string, data: string) => void,
        ) => () => void;
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
