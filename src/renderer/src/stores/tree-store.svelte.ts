// src/renderer/src/stores/tree-store.svelte.ts

interface TreeState {
  selectedNode: string | null;
  selectedChatFile: string | null;
  selectedPreviewFile: string | null;
  expandedNodePaths: string[];
  // Drag and drop state
  draggedNode: string | null;
  dropTarget: string | null;
  isDragging: boolean;
}

// Tree view UI state - only selection and expansion state
export const treeState = $state<TreeState>({
  selectedNode: null,
  selectedChatFile: null,
  selectedPreviewFile: null,
  expandedNodePaths: [],
  // Drag and drop state
  draggedNode: null,
  dropTarget: null,
  isDragging: false,
});

// Internal store functions - used by service layer
// These handle only the state updates, not business logic

/**
 * Internal function to update tree selection state
 * Should be called by service layer, not directly by components
 */
export function setTreeSelectionState(
  treePath: string | null,
  chatPath: string | null,
  previewPath: string | null,
) {
  treeState.selectedNode = treePath;
  treeState.selectedChatFile = chatPath;
  treeState.selectedPreviewFile = previewPath;
}

/**
 * Toggle node expansion state
 */
export function toggleNodeExpansion(nodePath: string) {
  const index = treeState.expandedNodePaths.indexOf(nodePath);
  if (index !== -1) {
    treeState.expandedNodePaths.splice(index, 1);
  } else {
    treeState.expandedNodePaths.push(nodePath);
  }
}

/**
 * Expand a specific node
 */
export function expandNode(nodePath: string) {
  if (!treeState.expandedNodePaths.includes(nodePath)) {
    treeState.expandedNodePaths.push(nodePath);
  }
}

/**
 * Expand all parent directories of a given file path
 */
export function expandParentDirectories(filePath: string) {
  const pathParts = filePath.split("/");
  const parentPaths: string[] = [];

  // Build all parent directory paths
  for (let i = 1; i < pathParts.length; i++) {
    const parentPath = pathParts.slice(0, i + 1).join("/");
    parentPaths.push(parentPath);
  }

  // Expand all parent directories
  parentPaths.forEach((path) => {
    if (!treeState.expandedNodePaths.includes(path)) {
      treeState.expandedNodePaths.push(path);
    }
  });
}

/**
 * Collapse a specific node
 */
export function collapseNode(nodePath: string) {
  const index = treeState.expandedNodePaths.indexOf(nodePath);
  if (index !== -1) {
    treeState.expandedNodePaths.splice(index, 1);
  }
}

/**
 * Clear all selections
 */
export function clearSelection() {
  treeState.selectedNode = null;
  treeState.selectedChatFile = null;
  treeState.selectedPreviewFile = null;
}

/**
 * Reset all tree state
 */
export function resetTreeState() {
  treeState.selectedNode = null;
  treeState.selectedChatFile = null;
  treeState.selectedPreviewFile = null;
  treeState.expandedNodePaths.length = 0;
  // Reset drag and drop state
  treeState.draggedNode = null;
  treeState.dropTarget = null;
  treeState.isDragging = false;
}

/**
 * Start dragging a node
 */
export function startDrag(nodePath: string) {
  treeState.draggedNode = nodePath;
  treeState.isDragging = true;
  treeState.dropTarget = null;
}

/**
 * Set drop target during drag operation
 */
export function setDropTarget(targetPath: string | null) {
  treeState.dropTarget = targetPath;
}

/**
 * Clear drag state
 */
export function clearDragState() {
  treeState.draggedNode = null;
  treeState.dropTarget = null;
  treeState.isDragging = false;
}

/**
 * Check if a path can be dropped on target (prevents invalid operations)
 */
export function canDropOn(draggedPath: string, targetPath: string): boolean {
  // Cannot drop on self
  if (draggedPath === targetPath) return false;

  // Cannot drop parent into child (would create circular reference)
  if (targetPath.startsWith(draggedPath + "/")) return false;

  return true;
}

// Legacy function - kept for backward compatibility
// New code should use projectService.selectFile() instead
export function selectFile(filePath: string) {
  console.warn(
    "selectFile() is deprecated. Use projectService.selectFile() instead.",
  );

  treeState.selectedNode = filePath;

  if (filePath.endsWith(".chat.json")) {
    treeState.selectedChatFile = filePath;
    treeState.selectedPreviewFile = null;
  } else {
    treeState.selectedChatFile = null;
    treeState.selectedPreviewFile = filePath;
  }
}
