// src/preload/index.d.ts
import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    // api: unknown
    api: {
      getTrpcUrl: () => Promise<string | null>;
      showOpenDialog: () => Promise<string | null>;
    };
  }
}