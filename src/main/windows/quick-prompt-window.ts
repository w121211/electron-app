// src/main/windows/quick-prompt-window.ts
import { BrowserWindow, globalShortcut } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";
import type { MainProcessContext } from "../context.js";

export function ensureQuickPromptWindow(
  context: MainProcessContext,
): BrowserWindow {
  const existing = context.getQuickPromptWindow();
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const window = new BrowserWindow({
    width: 640,
    height: 420,
    resizable: true,
    maximizable: false,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    skipTaskbar: false,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  context.setQuickPromptWindow(window);

  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(false);
  }

  window.on("close", (event) => {
    if (context.isQuitting()) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  window.on("closed", () => {
    context.setQuickPromptWindow(null);
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/windows/quick-prompt/index.html`,
    );
  } else {
    window.loadFile(
      join(__dirname, "../renderer/windows/quick-prompt/index.html"),
    );
  }

  window.on("ready-to-show", () => {
    window.show();
    window.focus();
  });

  return window;
}

export function toggleQuickPromptWindow(context: MainProcessContext): void {
  const window = ensureQuickPromptWindow(context);
  if (window.isVisible()) {
    window.hide();
    return;
  }
  window.show();
  window.focus();
}

export function showQuickPromptWindow(context: MainProcessContext): boolean {
  const window = ensureQuickPromptWindow(context);
  window.show();
  window.focus();
  return true;
}

export function hideQuickPromptWindow(context: MainProcessContext): boolean {
  const window = context.getQuickPromptWindow();
  if (!window || window.isDestroyed()) {
    return false;
  }
  window.hide();
  return true;
}

export function focusQuickPromptWindow(context: MainProcessContext): boolean {
  const window = context.getQuickPromptWindow();
  if (!window || window.isDestroyed()) {
    return false;
  }
  window.focus();
  return true;
}

export function registerQuickPromptWindowShortcut(
  context: MainProcessContext,
): void {
  const accelerator =
    process.platform === "darwin"
      ? "CommandOrControl+Shift+."
      : "Control+Shift+.";

  const registered = globalShortcut.register(accelerator, () => {
    toggleQuickPromptWindow(context);
  });

  if (!registered) {
    console.warn(
      `Failed to register global shortcut for quick prompt: ${accelerator}`,
    );
  }
}
