// src/renderer/src/lib/keyboard.ts
import { treeState } from "../stores/tree-store.svelte.js";
import {
  showToast,
  uiState,
  closeAllModals,
} from "../stores/ui-store.svelte.js";
import { documentService } from "../services/document-service.js";
import { ui } from "../stores/ui.svelte.js";

// --- 1. Standalone Handlers ---

function handleSaveDocument() {
  if (ui.activeFilePath) {
    documentService.saveDocument(ui.activeFilePath).catch((err) => {
      console.error("Failed to save document via hotkey", err);
      showToast(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    });
  }
}

function handleNewPromptScript() {
  const selected = treeState.selectedNode;
  if (!selected) {
    showToast("Select a folder first", "warning");
    return;
  }

  showToast(
    "Prompt script creation is coming soon. Use the filesystem to add a .prompt.md file in the meantime.",
    "info",
  );
}

function handleEscape() {
  const preview = treeState.selectedPreviewFile;
  if (preview) {
    treeState.selectedPreviewFile = null;
    return;
  }
  closeAllModals();
}

function handleQuickLauncher() {
  uiState.quickLauncherOpen = true;
}

// --- 2. Shortcut Definitions ---

type ShortcutDefinition = {
  key: string;
  description: string;
  handler: (() => void | Promise<void>) | "showShortcuts";
  os: "mac" | "windows" | "linux" | "all";
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  preventDefault?: boolean;
};

const shortcutDefinitions: ShortcutDefinition[] = [
  // Navigation
  {
    key: "p",
    meta: true,
    os: "mac",
    handler: handleQuickLauncher,
    description: "Open Quick Launcher",
    preventDefault: true,
  },
  {
    key: "p",
    ctrl: true,
    os: "windows",
    handler: handleQuickLauncher,
    description: "Open Quick Launcher",
    preventDefault: true,
  },
  {
    key: "p",
    ctrl: true,
    os: "linux",
    handler: handleQuickLauncher,
    description: "Open Quick Launcher",
    preventDefault: true,
  },
  {
    key: "n",
    meta: true,
    os: "mac",
    handler: handleNewPromptScript,
    description: "Create new prompt script in selected folder",
    preventDefault: true,
  },
  {
    key: "n",
    ctrl: true,
    os: "windows",
    handler: handleNewPromptScript,
    description: "Create new prompt script in selected folder",
    preventDefault: true,
  },
  {
    key: "n",
    ctrl: true,
    os: "linux",
    handler: handleNewPromptScript,
    description: "Create new prompt script in selected folder",
    preventDefault: true,
  },

  {
    key: "Escape",
    os: "all",
    handler: handleEscape,
    description: "Close preview/modal",
    preventDefault: true,
  },
  {
    key: "s",
    meta: true,
    os: "mac",
    handler: handleSaveDocument,
    description: "Save current file",
    preventDefault: true,
  },
  {
    key: "s",
    ctrl: true,
    os: "windows",
    handler: handleSaveDocument,
    description: "Save current file",
    preventDefault: true,
  },
  {
    key: "s",
    ctrl: true,
    os: "linux",
    handler: handleSaveDocument,
    description: "Save current file",
    preventDefault: true,
  },
];

// --- 3. KeyboardManager Class ---

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  handler: () => void | Promise<void>;
  preventDefault?: boolean;
}

export class KeyboardManager {
  private shortcuts: KeyboardShortcut[] = [];
  private isEnabled = true;
  private os: "mac" | "windows" | "linux";
  private boundHandleKeydown: (event: KeyboardEvent) => void;

  constructor() {
    this.boundHandleKeydown = this.handleKeydown.bind(this);
    this.os = this.detectOS();
    this.setupDefaultShortcuts();
    this.bindEvents();
  }

  private detectOS(): "mac" | "windows" | "linux" {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf("Mac") !== -1) return "mac";
    if (userAgent.indexOf("Win") !== -1) return "windows";
    if (userAgent.indexOf("Linux") !== -1) return "linux";
    // Default, though less likely for Electron
    return "windows";
  }

  private setupDefaultShortcuts() {
    const platformShortcuts = shortcutDefinitions.filter(
      (def) => def.os === this.os || def.os === "all",
    );

    this.shortcuts = platformShortcuts.map((def) => {
      const handler =
        typeof def.handler === "function"
          ? def.handler
          : () => this.showShortcuts();

      return {
        key: def.key,
        description: def.description,
        handler: handler,
        metaKey: !!def.meta,
        ctrlKey: !!def.ctrl,
        shiftKey: !!def.shift,
        altKey: !!def.alt,
        preventDefault: !!def.preventDefault,
      };
    });
  }

  private bindEvents() {
    document.addEventListener("keydown", this.boundHandleKeydown);
  }

  private handleKeydown(event: KeyboardEvent) {
    if (!this.isEnabled) return;

    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.contentEditable === "true"
    ) {
      if (event.key !== "Escape" && !event.ctrlKey && !event.metaKey) {
        return;
      }
    }

    const shortcut = this.shortcuts.find((s) => this.matchesShortcut(event, s));

    if (shortcut) {
      if (shortcut.preventDefault) {
        event.preventDefault();
      }
      shortcut.handler();
    }
  }

  private matchesShortcut(
    event: KeyboardEvent,
    shortcut: KeyboardShortcut,
  ): boolean {
    return (
      event.key === shortcut.key &&
      !!event.ctrlKey === !!shortcut.ctrlKey &&
      !!event.shiftKey === !!shortcut.shiftKey &&
      !!event.altKey === !!shortcut.altKey &&
      !!event.metaKey === !!shortcut.metaKey
    );
  }

  private showShortcuts() {
    const shortcutList = this.shortcuts
      .map((s) => {
        const keys: string[] = [];
        if (s.metaKey) keys.push("Cmd");
        if (s.ctrlKey) keys.push("Ctrl");
        if (s.shiftKey) keys.push("Shift");
        if (s.altKey) keys.push("Alt");
        keys.push(s.key);
        return `${keys.join(" + ")} - ${s.description}`;
      })
      .join("\n");

    showToast(`Keyboard Shortcuts:\n${shortcutList}`, "info");
  }

  public enable() {
    this.isEnabled = true;
  }
  public disable() {
    this.isEnabled = false;
  }
  public getShortcuts() {
    return [...this.shortcuts];
  }
  public isManagerEnabled() {
    return this.isEnabled;
  }

  public destroy() {
    document.removeEventListener("keydown", this.boundHandleKeydown);
  }
}

// Singleton instance
export const keyboardManager = new KeyboardManager();
