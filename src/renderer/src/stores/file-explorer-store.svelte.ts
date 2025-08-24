// src/renderer/src/stores/file-explorer-store.svelte.ts

export interface ContextMenuState {
  isVisible: boolean;
  targetPath: string;
  isDirectory: boolean;
  isProjectFolder: boolean;
  x: number;
  y: number;
}

export interface RenameDialogState {
  isVisible: boolean;
  targetPath: string;
  currentName: string;
}

export interface InlineFolderCreationState {
  isActive: boolean;
  parentPath: string;
  placeholderName: string;
}

export interface InlineNewProjectFolderState {
  isActive: boolean;
  placeholderName: string;
  needsWorkspaceDirectory: boolean;
}

export interface WorkspaceSetupState {
  needsSetup: boolean;
  isSettingUp: boolean;
}

interface FileExplorerState {
  contextMenu: ContextMenuState;
  renameDialog: RenameDialogState;
  inlineFolderCreation: InlineFolderCreationState;
  inlineNewProjectFolder: InlineNewProjectFolderState;
  workspaceSetup: WorkspaceSetupState;
}

// Unified state object
export const fileExplorerState = $state<FileExplorerState>({
  contextMenu: {
    isVisible: false,
    targetPath: "",
    isDirectory: false,
    isProjectFolder: false,
    x: 0,
    y: 0,
  },
  renameDialog: {
    isVisible: false,
    targetPath: "",
    currentName: "",
  },
  inlineFolderCreation: {
    isActive: false,
    parentPath: "",
    placeholderName: "New folder",
  },
  inlineNewProjectFolder: {
    isActive: false,
    placeholderName: "New project",
    needsWorkspaceDirectory: false,
  },
  workspaceSetup: {
    needsSetup: false,
    isSettingUp: false,
  },
});

// Context Menu Actions
export function showContextMenu(
  path: string,
  isDirectory: boolean,
  x: number,
  y: number,
  isProjectFolder = false,
) {
  // Adjust position if menu would go off screen
  const menuWidth = 192; // w-48 = 12rem = 192px
  const menuHeight = 200; // approximate height

  const finalX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const finalY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  fileExplorerState.contextMenu.isVisible = true;
  fileExplorerState.contextMenu.targetPath = path;
  fileExplorerState.contextMenu.isDirectory = isDirectory;
  fileExplorerState.contextMenu.isProjectFolder = isProjectFolder;
  fileExplorerState.contextMenu.x = finalX;
  fileExplorerState.contextMenu.y = finalY;
}

export function closeContextMenu() {
  fileExplorerState.contextMenu.isVisible = false;
}

// Dialog Actions
export function showRenameDialog(path: string) {
  const fileName = path.split("/").pop() || "";
  console.log("🎯 FileExplorerStore: Showing rename dialog for:", fileName);

  fileExplorerState.renameDialog.isVisible = true;
  fileExplorerState.renameDialog.targetPath = path;
  fileExplorerState.renameDialog.currentName = fileName;
}

export function closeRenameDialog() {
  fileExplorerState.renameDialog.isVisible = false;
}

// Inline Folder Creation Actions
export function startInlineFolderCreation(parentPath: string) {
  console.log(
    "🎯 FileExplorerStore: Starting inline folder creation for:",
    parentPath,
  );

  fileExplorerState.inlineFolderCreation.isActive = true;
  fileExplorerState.inlineFolderCreation.parentPath = parentPath;
  fileExplorerState.inlineFolderCreation.placeholderName = "New folder";
}

export function cancelInlineFolderCreation() {
  fileExplorerState.inlineFolderCreation.isActive = false;
  fileExplorerState.inlineFolderCreation.parentPath = "";
}

export function updateInlineFolderName(name: string) {
  fileExplorerState.inlineFolderCreation.placeholderName = name;
}

// Inline New Project Folder Actions
export function startInlineNewProjectFolderCreation(
  needsWorkspaceDirectory = false,
) {
  fileExplorerState.inlineNewProjectFolder.isActive = true;
  fileExplorerState.inlineNewProjectFolder.placeholderName = "New project";
  fileExplorerState.inlineNewProjectFolder.needsWorkspaceDirectory =
    needsWorkspaceDirectory;
}

export function cancelInlineNewProjectFolderCreation() {
  fileExplorerState.inlineNewProjectFolder.isActive = false;
  fileExplorerState.inlineNewProjectFolder.needsWorkspaceDirectory = false;
}

export function updateInlineNewProjectFolderName(name: string) {
  fileExplorerState.inlineNewProjectFolder.placeholderName = name;
}

// Workspace Setup Actions
export function setWorkspaceSetupNeeded(needsSetup: boolean) {
  fileExplorerState.workspaceSetup.needsSetup = needsSetup;
}

export function setWorkspaceSettingUp(isSettingUp: boolean) {
  fileExplorerState.workspaceSetup.isSettingUp = isSettingUp;
}
