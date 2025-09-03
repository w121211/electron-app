// src/renderer/src/services/file-explorer-service.ts
import { Logger } from "tslog";
import {
  closeContextMenu,
  showRenameDialog,
  closeRenameDialog,
  startInlineFolderCreation,
} from "../stores/file-explorer-store.svelte.js";
import { expandNode } from "../stores/tree-store.svelte.js";
import { showToast } from "../stores/ui-store.svelte.js";
import { projectService } from "./project-service.js";

export class FileExplorerService {
  private logger = new Logger({ name: "FileExplorerService" });

  // File Action Handlers
  async handleFileAction(action: string, path: string) {
    console.log(
      "🎯 FileExplorerService: Handling action:",
      action,
      "for:",
      path,
    );

    try {
      switch (action) {
        case "add-to-chat":
          showToast("Add to current chat: Not yet implemented", "info");
          break;

        case "add-to-project":
          showToast("Add to project context: Not yet implemented", "info");
          break;

        case "copy-reference":
          showToast("Copy reference: Not yet implemented", "info");
          break;

        case "rename":
          // Close context menu first, then show rename dialog with delay
          closeContextMenu();
          setTimeout(() => {
            showRenameDialog(path);
          }, 50);
          break;

        case "duplicate":
          closeContextMenu();
          await projectService.duplicateFile(path);
          break;

        case "delete":
          closeContextMenu();
          if (confirm("Are you sure you want to delete this file?")) {
            await projectService.deleteFile(path);
          }
          break;

        case "remove-from-projects":
          closeContextMenu();
          if (confirm("Are you sure you want to remove this project folder?")) {
            // Remove project folder directly using path
            await projectService.removeProjectFolder(path);
          }
          break;

        case "create-folder":
          closeContextMenu();
          // Expand the parent node first so the inline input is visible
          expandNode(path);
          startInlineFolderCreation(path);
          break;

        case "show-in-folder":
          closeContextMenu();
          await this.showInFolder(path);
          break;

        default:
          this.logger.warn("Unknown file action:", action);
      }
    } catch (error) {
      this.logger.error("File action failed:", error);
      // Error handling is done in projectService
    }
  }

  async handleRename(path: string, newName: string) {
    try {
      await projectService.renameFile(path, newName);
      closeRenameDialog();
    } catch (error) {
      this.logger.error("Rename failed:", error);
      // Error handling is done in projectService
    }
  }

  async createFolderInline(parentPath: string, folderName: string) {
    try {
      await projectService.createFolder(parentPath, folderName);
      // Don't cancel inline creation here - let the file watcher handle it
      // when it detects the folder was actually created
      return { success: true };
    } catch (error) {
      this.logger.error("Inline folder creation failed:", error);
      // Don't close inline creation on error - let user try again or cancel
      return { success: false, error };
    }
  }

  async showInFolder(filePath: string) {
    try {
      if (typeof window !== "undefined" && (window as any).api?.showInFolder) {
        await (window as any).api.showInFolder(filePath);
        this.logger.info("Opened file in OS file manager:", filePath);
      } else {
        showToast("OS file manager not available", "error");
        this.logger.error("showInFolder API not available");
      }
    } catch (error) {
      this.logger.error("Failed to show file in folder:", error);
      showToast("Failed to open file in OS file manager", "error");
    }
  }
}

export const fileExplorerService = new FileExplorerService();
