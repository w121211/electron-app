<!-- src/renderer/src/components/file-explorer/TreeNode.svelte -->
<script lang="ts">
  import {
    ThreeDotsVertical,
    ChatDots,
    ArrowClockwise,
  } from "svelte-bootstrap-icons";
  import {
    treeState,
    startDrag,
    setDropTarget,
    clearDragState,
    canDropOn,
  } from "../../stores/tree-store.svelte.js";
  import { tasksByPath } from "../../stores/task-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { getActiveEditorContext } from "../../stores/ui.svelte.js";
  import { uiState, showToast } from "../../stores/ui-store.svelte.js";
  import {
    fileExplorerState,
    cancelInlineFolderCreation,
    updateInlineFolderName,
    showContextMenu,
  } from "../../stores/file-explorer-store.svelte.js";
  import { fileExplorerService } from "../../services/file-explorer-service.js";
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import type { FolderTreeNode } from "../../stores/project-store.svelte.js";

  interface TreeNodeProps {
    node: FolderTreeNode;
    level: number;
  }

  let { node, level }: TreeNodeProps = $props();

  const activeContext = $derived.by(getActiveEditorContext);

  const isCreatingChat = $derived(uiState.loadingStates["createChat"] || false);
  const isExpanded = $derived(treeState.expandedNodePaths.includes(node.path));
  const isSelected = $derived(treeState.selectedNode === node.path);
  const task = $derived(tasksByPath.get(node.path));
  const isTaskDir = $derived(isTaskFolder(node.name));
  const isProjectFolder = $derived(level === 0);
  const isPromptScript = $derived(node.name.endsWith(".prompt.md"));
  const isCurrentPromptScript = $derived(
    isPromptScript && activeContext?.filePath === node.path,
  );
  const isLoadingRerunChat = $derived(
    uiState.loadingStates["rerunChat"] || false,
  );

  const showPlaceholderFolder = $derived(
    fileExplorerState.inlineFolderCreation.isActive &&
      fileExplorerState.inlineFolderCreation.parentPath === node.path &&
      node.isDirectory,
  );

  let folderNameInput = $state<HTMLInputElement>();
  let placeholderName = $state(
    fileExplorerState.inlineFolderCreation.placeholderName,
  );
  let isCreatingFolder = $state(false);

  const isDragged = $derived(treeState.draggedNode === node.path);

  const shouldHighlightFolder = $derived(
    treeState.isDragging &&
      node.isDirectory &&
      treeState.dropTarget === node.path,
  );

  const shouldHighlightAsFileLevel = $derived(
    treeState.isDragging &&
      !node.isDirectory &&
      treeState.dropTarget === node.path,
  );

  function getParentPath(filePath: string): string {
    const parts = filePath.split("/");
    return parts.slice(0, -1).join("/");
  }

  function handleNodeClick(): void {
    projectService.handleTreeNodeClick(node);
  }

  function handleNewPromptScript(e: MouseEvent): void {
    e.stopPropagation();
    showToast(
      "Prompt script creation from the explorer is coming soon. Create a .prompt.md file manually for now.",
      "info",
    );
  }

  function handleContextMenu(e: MouseEvent): void {
    e.stopPropagation();
    showContextMenu(
      node.path,
      node.isDirectory,
      e.clientX,
      e.clientY,
      isProjectFolder,
    );
  }

  async function handleReplayPromptScript(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript) {
      return;
    }

    showToast(
      "Prompt script replay is not yet available. Use the chat panel to refresh the session.",
      "info",
    );
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNodeClick();
    }
  }

  function isTaskFolder(folderName: string): boolean {
    return folderName.startsWith("task-");
  }

  function getTaskStatusConfig(status: string): {
    label: string;
    className: string;
  } {
    const statusMap: { [key: string]: string } = {
      COMPLETED: "completed",
      IN_PROGRESS: "running",
      CREATED: "created",
      INITIALIZED: "ready",
      PAUSED: "paused",
    };
    return {
      label: statusMap[status] || status.toLowerCase().replace("_", "-"),
      className: "border-border text-foreground",
    };
  }

  function handleDragStart(e: DragEvent): void {
    if (!e.dataTransfer) return;
    startDrag(node.path);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.path);
  }

  function handleDragOver(e: DragEvent): void {
    if (!treeState.isDragging) return;
    e.preventDefault();
    const draggedPath = treeState.draggedNode;
    const targetPath = node.isDirectory ? node.path : getParentPath(node.path);
    if (draggedPath && canDropOn(draggedPath, targetPath)) {
      e.dataTransfer!.dropEffect = "move";
      setDropTarget(node.path);
    } else {
      e.dataTransfer!.dropEffect = "none";
    }
  }

  function handleDragLeave(e: DragEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDropTarget(null);
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!treeState.draggedNode) return;
    const draggedPath = treeState.draggedNode;
    const targetPath = node.isDirectory ? node.path : getParentPath(node.path);
    if (!canDropOn(draggedPath, targetPath)) {
      clearDragState();
      return;
    }
    const fileName = draggedPath.split("/").pop() || "";
    const newPath = targetPath + "/" + fileName;
    projectService.moveFile(draggedPath, newPath).catch(console.error);
    clearDragState();
  }

  function handleDragEnd(): void {
    clearDragState();
  }

  function handleFolderNameKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelFolderCreation();
    }
  }

  function handleFolderNameBlur(): void {
    if (isCreatingFolder) return;
    if (placeholderName.trim()) handleCreateFolder();
    else handleCancelFolderCreation();
  }

  async function handleCreateFolder(): Promise<void> {
    const trimmedName = placeholderName.trim();
    if (!trimmedName || isCreatingFolder) {
      if (!trimmedName) handleCancelFolderCreation();
      return;
    }
    isCreatingFolder = true;
    try {
      await fileExplorerService.createFolderInline(node.path, trimmedName);
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      isCreatingFolder = false;
    }
  }

  function handleCancelFolderCreation(): void {
    cancelInlineFolderCreation();
  }

  function handlePlaceholderNameChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    placeholderName = target.value;
    updateInlineFolderName(target.value);
  }

  $effect(() => {
    if (showPlaceholderFolder && folderNameInput) {
      setTimeout(() => {
        folderNameInput?.focus();
        folderNameInput?.select();
      }, 10);
    }
  });
</script>

<div class="pb-0.5">
  <!-- Node Row -->
  <div
    role="button"
    tabindex="0"
    draggable={!isProjectFolder}
    class:font-medium={isProjectFolder}
    class="group relative flex min-h-[20px] w-full cursor-pointer items-center rounded py-1 text-xs transition-colors
      {isSelected ? 'bg-selected' : 'hover:bg-hover'}
      {isProjectFolder ? '' : 'text-foreground px-1'}
      {isDragged ? 'opacity-50' : ''}
      {shouldHighlightFolder || shouldHighlightAsFileLevel ? 'bg-hover' : ''}"
    style="padding-left: {level * 10}px;"
    onclick={handleNodeClick}
    onkeydown={handleKeydown}
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    ondragend={handleDragEnd}
  >
    <!-- Icon -->
    <div class="mr-1 flex w-4 shrink-0 items-center justify-center">
      <!-- {#if node.isDirectory}
        {#if isExpanded}
          <ChevronDown class="text-muted" width={12} height={12} />
        {:else}
          <ChevronRight class="text-muted" width={12} height={12} />
        {/if}
      {:else} -->
      <FileIcon
        fileName={node.name}
        isDirectory={node.isDirectory}
        isExpanded={false}
        size={10}
      />
      <!-- {/if} -->
    </div>

    <!-- Name -->
    <span class="flex-1 truncate" title={node.name}>{node.name}</span>

    <!-- Statuses -->
    {#if isTaskDir && task}
      {@const statusConfig = getTaskStatusConfig(task.status)}
      <span
        class="ml-1 rounded border px-1 py-0.5 font-mono text-[10px] {statusConfig.className}"
      >
        {statusConfig.label}
      </span>
    {/if}
    {#if isPromptScript && isCurrentPromptScript}
      <span
        class="border-border text-foreground ml-1 rounded border px-1 py-0.5 font-mono text-[10px]"
      >
        active
      </span>
    {/if}

    <!-- Actions -->
    <div
      class="ml-auto flex items-center pl-1 opacity-0 group-hover:opacity-100"
    >
      {#if isPromptScript}
        <button
          onclick={handleReplayPromptScript}
          disabled={isLoadingRerunChat}
          class="text-muted hover:text-accent cursor-pointer p-0.5 disabled:opacity-50"
          title="Replay Prompt Script"
        >
          <ArrowClockwise width={12} height={12} />
        </button>
      {/if}
      {#if node.isDirectory}
        <button
          onclick={handleNewPromptScript}
          disabled={isCreatingChat}
          class="text-muted hover:text-accent cursor-pointer p-0.5 disabled:opacity-30"
          title="New Prompt Script"
        >
          <ChatDots width={12} height={12} />
        </button>
      {/if}
      <button
        onclick={handleContextMenu}
        class="text-muted hover:text-accent cursor-pointer p-0.5"
        title="More options"
      >
        <ThreeDotsVertical width={12} height={12} />
      </button>
    </div>
  </div>

  <!-- Children -->
  {#if node.isDirectory && isExpanded}
    <div class="ml-1">
      {#if showPlaceholderFolder}
        <div
          class="flex min-h-[20px] w-full items-center rounded px-1 py-1 text-xs {isCreatingFolder
            ? 'bg-selected opacity-75'
            : 'bg-hover'}"
        >
          <div class="mr-1 flex w-4 shrink-0 items-center justify-center">
            <FileIcon fileName="" isDirectory={true} size={10} />
          </div>
          <input
            bind:this={folderNameInput}
            bind:value={placeholderName}
            oninput={handlePlaceholderNameChange}
            onkeydown={handleFolderNameKeydown}
            onblur={handleFolderNameBlur}
            disabled={isCreatingFolder}
            class="border-accent text-foreground focus:ring-accent/50 flex-1 rounded border bg-transparent px-1 py-0 text-xs focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            type="text"
            placeholder="Folder name"
          />
          {#if isCreatingFolder}
            <div
              class="border-accent ml-2 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
            ></div>
          {/if}
        </div>
      {/if}

      {#if node.children}
        {#each node.children as child (child.path)}
          <TreeNode node={child} level={level + 1} />
        {/each}
      {/if}
    </div>
  {/if}
</div>
