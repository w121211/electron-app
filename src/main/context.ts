// src/main/context.ts
import type { BrowserWindow } from "electron";
import type { HttpTrpcServer } from "../core/server/trpc-server.js";
import type { PtyInstanceManager } from "../core/services/pty/pty-instance-manager.js";

export interface MainProcessContext {
  trpcServer: HttpTrpcServer;
  ptyInstanceManager: PtyInstanceManager;
  userDataDir: string;
  getMainWindow(): BrowserWindow | null;
  setMainWindow(window: BrowserWindow | null): void;
  getQuickPromptWindow(): BrowserWindow | null;
  setQuickPromptWindow(window: BrowserWindow | null): void;
  isQuitting(): boolean;
  setQuitting(value: boolean): void;
}

interface WindowRegistry {
  main: BrowserWindow | null;
  quickPrompt: BrowserWindow | null;
}

export function createMainProcessContext(
  dependencies: {
    trpcServer: HttpTrpcServer;
    ptyInstanceManager: PtyInstanceManager;
    userDataDir: string;
  },
): MainProcessContext {
  const windows: WindowRegistry = {
    main: null,
    quickPrompt: null,
  };
  let quitting = false;

  return {
    trpcServer: dependencies.trpcServer,
    ptyInstanceManager: dependencies.ptyInstanceManager,
    userDataDir: dependencies.userDataDir,
    getMainWindow: () => windows.main,
    setMainWindow: (window) => {
      windows.main = window;
    },
    getQuickPromptWindow: () => windows.quickPrompt,
    setQuickPromptWindow: (window) => {
      windows.quickPrompt = window;
    },
    isQuitting: () => quitting,
    setQuitting: (value) => {
      quitting = value;
    },
  };
}
