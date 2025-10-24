// src/renderer/src/stores/project-store.svelte.ts

export interface ProjectDirectory {
  name: string;
  path: string;
}

// @deprecated Use ProjectDirectory instead
export type ProjectFolder = ProjectDirectory;

export interface FolderTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FolderTreeNode[];
}

interface ProjectState {
  projectFolders: ProjectDirectory[];
  folderTrees: Record<string, FolderTreeNode>;
}

// Unified state object
export const projectState = $state<ProjectState>({
  projectFolders: [],
  folderTrees: {},
});

// Mutation functions
export function setProjectFolders(folders: ProjectDirectory[]) {
  projectState.projectFolders = folders;
}

export function addProjectFolder(folder: ProjectDirectory) {
  projectState.projectFolders = [...projectState.projectFolders, folder];
}

// export function removeProjectFolder(projectFolderId: string) {
//   projectState.projectFolders = projectState.projectFolders.filter(
//     (f) => f.id !== projectFolderId,
//   );
// }

export function setFolderTree(projectId: string, tree: FolderTreeNode) {
  projectState.folderTrees = {
    ...projectState.folderTrees,
    [projectId]: tree,
  };
}

export function removeFolderTree(projectId: string) {
  const { [projectId]: removed, ...rest } = projectState.folderTrees;
  projectState.folderTrees = rest;
}

export function updateFolderTrees(
  updater: (
    trees: Record<string, FolderTreeNode>,
  ) => Record<string, FolderTreeNode>,
) {
  projectState.folderTrees = updater(projectState.folderTrees);
}
