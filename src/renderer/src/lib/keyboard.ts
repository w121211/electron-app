// src/renderer/src/lib/keyboard.ts
import { treeState } from "../stores/tree-store.svelte.js";
import { chatService } from "../services/chat-service.js";
import { projectService } from "../services/project-service.js";
import { showToast, uiState } from "../stores/ui-store.svelte.js";

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
  private isMac: boolean;
  private boundHandleKeydown: (event: KeyboardEvent) => void;

  constructor() {
    this.boundHandleKeydown = this.handleKeydown.bind(this);
    this.isMac = this.detectMacPlatform();
    this.setupDefaultShortcuts();
    this.bindEvents();
  }

  private detectMacPlatform(): boolean {
    return navigator.userAgent.toUpperCase().indexOf("MAC") >= 0;
  }

  private getMacShortcuts(): KeyboardShortcut[] {
    return [
      // Navigation shortcuts
      {
        key: "p",
        metaKey: true,
        description: "Open Quick Launcher",
        handler: this.handleQuickLauncher,
        preventDefault: true,
      },
      {
        key: "n",
        metaKey: true,
        description: "Create new chat in selected folder",
        handler: this.handleNewChat,
        preventDefault: true,
      },
      {
        key: "p",
        metaKey: true,
        shiftKey: true,
        description: "Add project folder",
        handler: this.handleAddProject,
        preventDefault: true,
      },
      {
        key: "f",
        metaKey: true,
        description: "Focus file search",
        handler: this.handleFocusSearch,
        preventDefault: true,
      },
      {
        key: "Enter",
        metaKey: true,
        description: "Send message (in chat)",
        handler: this.handleSendMessage,
        preventDefault: true,
      },
      {
        key: "Escape",
        description: "Close preview/modal",
        handler: this.handleEscape,
        preventDefault: true,
      },
      {
        key: "/",
        metaKey: true,
        description: "Show keyboard shortcuts",
        handler: this.handleShowShortcuts,
        preventDefault: true,
      },
      // File operations
      {
        key: "r",
        metaKey: true,
        description: "Refresh current view",
        handler: this.handleRefresh,
        preventDefault: true,
      },
      {
        key: "c",
        metaKey: true,
        shiftKey: true,
        description: "Copy file path",
        handler: this.handleCopyPath,
        preventDefault: true,
      },
    ];
  }

  private getWindowsLinuxShortcuts(): KeyboardShortcut[] {
    return [
      // Navigation shortcuts
      {
        key: "p",
        ctrlKey: true,
        description: "Open Quick Launcher",
        handler: this.handleQuickLauncher,
        preventDefault: true,
      },
      {
        key: "n",
        ctrlKey: true,
        description: "Create new chat in selected folder",
        handler: this.handleNewChat,
        preventDefault: true,
      },
      {
        key: "p",
        ctrlKey: true,
        shiftKey: true,
        description: "Add project folder",
        handler: this.handleAddProject,
        preventDefault: true,
      },
      {
        key: "f",
        ctrlKey: true,
        description: "Focus file search",
        handler: this.handleFocusSearch,
        preventDefault: true,
      },
      {
        key: "Enter",
        ctrlKey: true,
        description: "Send message (in chat)",
        handler: this.handleSendMessage,
        preventDefault: true,
      },
      {
        key: "Escape",
        description: "Close preview/modal",
        handler: this.handleEscape,
        preventDefault: true,
      },
      {
        key: "/",
        ctrlKey: true,
        description: "Show keyboard shortcuts",
        handler: this.handleShowShortcuts,
        preventDefault: true,
      },
      // File operations
      {
        key: "r",
        ctrlKey: true,
        description: "Refresh current view",
        handler: this.handleRefresh,
        preventDefault: true,
      },
      {
        key: "c",
        ctrlKey: true,
        shiftKey: true,
        description: "Copy file path",
        handler: this.handleCopyPath,
        preventDefault: true,
      },
    ];
  }

  private setupDefaultShortcuts() {
    this.shortcuts = this.isMac
      ? this.getMacShortcuts()
      : this.getWindowsLinuxShortcuts();
  }

  private bindEvents() {
    document.addEventListener("keydown", this.boundHandleKeydown);
  }

  private handleKeydown(event: KeyboardEvent) {
    if (!this.isEnabled) return;

    // Don't handle shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.contentEditable === "true"
    ) {
      // Allow Escape and some Ctrl shortcuts even in inputs
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

  // Shortcut handlers
  private async handleNewChat() {
    const selected = treeState.selectedNode;
    if (!selected) {
      showToast("Select a folder first", "warning");
      return;
    }

    try {
      await chatService.createEmptyChat(selected);
    } catch (error) {
      // Error handled by service
    }
  }

  private async handleAddProject() {
    const path = prompt("Enter project folder path:");
    if (!path) return;

    try {
      await projectService.addProjectFolder(path);
    } catch (error) {
      // Error handled by service
    }
  }

  private handleFocusSearch() {
    // Focus search input if it exists
    const searchInput = document.querySelector(
      "[data-search-input]",
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    } else {
      showToast("Search functionality coming soon", "info");
    }
  }

  private handleSendMessage() {
    // Trigger send message if in chat
    const sendButton = document.querySelector(
      "[data-send-button]",
    ) as HTMLButtonElement;
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    }
  }

  private handleEscape() {
    // Close preview if open
    const preview = treeState.selectedPreviewFile;
    if (preview) {
      treeState.selectedPreviewFile = null;
      return;
    }

    // Close any modals
    const modal = document.querySelector("[data-modal]");
    if (modal) {
      const closeButton = modal.querySelector(
        "[data-close]",
      ) as HTMLButtonElement;
      closeButton?.click();
    }
  }

  private handleShowShortcuts() {
    const shortcutList = this.shortcuts
      .map((s) => {
        const keys: string[] = [];
        if (s.ctrlKey) keys.push("Ctrl");
        if (s.shiftKey) keys.push("Shift");
        if (s.altKey) keys.push("Alt");
        if (s.metaKey) keys.push("Cmd");
        keys.push(s.key);
        return `${keys.join("+")} - ${s.description}`;
      })
      .join("\n");

    showToast(`Keyboard Shortcuts:\n${shortcutList}`, "info");
  }

  private handleRefresh() {
    // Refresh current view
    const refreshButton = document.querySelector(
      "[data-refresh]",
    ) as HTMLButtonElement;
    if (refreshButton) {
      refreshButton.click();
    } else {
      window.location.reload();
    }
  }

  private handleCopyPath() {
    const selected = treeState.selectedNode;
    if (selected) {
      navigator.clipboard.writeText(selected);
      showToast(`Path copied: ${selected}`, "success");
    } else {
      showToast("No file selected", "warning");
    }
  }

  private handleQuickLauncher() {
    try {
      uiState.quickLauncherOpen = true;
    } catch (error) {
      showToast("Failed to open Quick Launcher", "error");
    }
  }

  public enable() {
    this.isEnabled = true;
  }

  public disable() {
    this.isEnabled = false;
  }

  public addShortcut(shortcut: KeyboardShortcut) {
    this.shortcuts.push(shortcut);
  }

  public removeShortcut(key: string) {
    this.shortcuts = this.shortcuts.filter((s) => s.key !== key);
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
