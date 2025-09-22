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
      pty: {
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
      };
    };
  }
}
