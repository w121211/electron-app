// src/preload/index.d.ts
import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    // api: unknown
    api: {
      getTrpcUrl: () => Promise<string | null>;
      showOpenDialog: () => Promise<string | null>;
      showInFolder: (filePath: string) => Promise<void>;
      pty: {
        create: (options?: any) => Promise<string | null>;
        write: (sessionId: string, data: string) => Promise<boolean>;
        resize: (sessionId: string, options: { cols: number; rows: number }) => Promise<boolean>;
        destroy: (sessionId: string) => Promise<boolean>;
        onData: (callback: (sessionId: string, data: string) => void) => void;
        onExit: (callback: (sessionId: string, exitCode: number, signal?: number) => void) => void;
        removeAllListeners: () => void;
      };
    };
  }
}