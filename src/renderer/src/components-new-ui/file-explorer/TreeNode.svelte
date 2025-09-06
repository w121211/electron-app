<!-- src/renderer/src/components-new-ui/file-explorer/TreeNode.svelte -->
<script lang="ts">
  import {
    ChevronDown,
    ChevronRight,
    ThreeDotsVertical,
    ChatDots,
    StopFill,
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
  import { chatService } from "../../services/chat-service.js";
  import { chatState } from "../../stores/chat-store.svelte.js";
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
    compactMode?: boolean;
  }

  let { node, level, compactMode = true }: TreeNodeProps = $props();

  const isCreatingChat = $derived(uiState.loadingStates["createChat"] || false);
  const isExpanded = $derived(treeState.expandedNodePaths.includes(node.path));
  const isSelected = $derived(treeState.selectedNode === node.path);
  const task = $derived(tasksByPath.get(node.path));
  const isTaskDir = $derived(isTaskFolder(node.name));
  const isProjectFolder = $derived(level === 0);
  const isChatFile = $derived(node.name.endsWith(".chat.json"));
  const isCurrentChatFile = $derived(
    isChatFile && chatState.currentChat?.absoluteFilePath === node.path,
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

  function handleNewChat(e: MouseEvent): void {
    e.stopPropagation();
    chatService.createEmptyChat(node.path);
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

  function handleStopTask(e: MouseEvent): void {
    e.stopPropagation();
    showToast("Stop task functionality coming soon", "info");
  }

  async function handleRerunChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isChatFile) return;

    try {
      if (!isCurrentChatFile) {
        await chatService.openChatFile(node.path);
      }
      const currentChat = chatState.currentChat;
      if (currentChat) {
        await chatService.rerunChat(
          currentChat.absoluteFilePath,
          currentChat.id,
        );
      }
    } catch (error) {
      console.error("Failed to rerun chat:", error);
    }
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

  function getTaskStatusConfig(status: string): { label: string; className: string } {
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

<div class="pb-1">
  <!-- Node Row -->
  <div
    role="button"
    tabindex="0"
    draggable={!isProjectFolder}
    class:font-medium={isProjectFolder}
    class="group relative flex min-h-[24px] w-full cursor-pointer items-center rounded py-0.5 text-xs font-[400] transition-colors
      {!isProjectFolder && isSelected ? 'bg-selected text-foreground' : ''}
      {isProjectFolder ? '' : 'hover:bg-hover text-foreground px-1'}
      {isDragged ? 'opacity-50' : ''}
      {shouldHighlightFolder || shouldHighlightAsFileLevel ? 'bg-hover' : ''}"
    style="padding-left: {level * 14}px;"
    onclick={handleNodeClick}
    onkeydown={handleKeydown}
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    ondragend={handleDragEnd}
  >
    <!-- Icon -->
    <div class="mr-1.5 flex w-4 shrink-0 items-center justify-center">
      {#if node.isDirectory}
        {#if isExpanded}
          <ChevronDown class="text-muted text-xs" />
        {:else}
          <ChevronRight class="text-muted text-xs" />
        {/if}
      {:else}
        <FileIcon
          fileName={node.name}
          isDirectory={node.isDirectory}
          isExpanded={false}
          size="text-xs"
        />
      {/if}
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
    {#if isChatFile && isCurrentChatFile}
      {@const sessionStatus = chatState.currentChat?.sessionStatus || "idle"}
      {#if sessionStatus === "processing"}
        <span
          class="border-border text-foreground ml-1 rounded border px-1 py-0.5 font-mono text-[10px]"
        >
          running
        </span>
        <button
          onclick={handleStopTask}
          class="text-muted hover:text-accent mr-1 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
          title="Stop Chat"
        >
          <StopFill class="text-xs" />
        </button>
      {:else if sessionStatus === "waiting_confirmation"}
        <span
          class="border-border text-foreground ml-1 rounded border px-1 py-0.5 font-mono text-[10px]"
        >
          waiting
        </span>
      {/if}
    {/if}

    <!-- Actions -->
    <div
      class="ml-auto flex items-center pl-1 opacity-0 group-hover:opacity-100"
    >
      {#if isChatFile}
        <button
          onclick={handleRerunChat}
          disabled={isLoadingRerunChat}
          class="text-muted hover:text-accent cursor-pointer p-0.5 disabled:opacity-50"
          title="Rerun Chat"
        >
          <ArrowClockwise class="text-xs" />
        </button>
      {/if}
      {#if node.isDirectory}
        <button
          onclick={handleNewChat}
          disabled={isCreatingChat}
          class="text-muted hover:text-accent cursor-pointer p-0.5 disabled:opacity-30"
          title="New Chat"
        >
          <ChatDots class="text-xs" />
        </button>
      {/if}
      <button
        onclick={handleContextMenu}
        class="text-muted hover:text-accent cursor-pointer p-0.5"
        title="More options"
      >
        <ThreeDotsVertical class="text-xs" />
      </button>
    </div>
  </div>

  <!-- Children -->
  {#if node.isDirectory && isExpanded}
    <div class="ml-2">
      {#if showPlaceholderFolder}
        <div
          class="flex min-h-[24px] w-full items-center rounded px-1 py-0.5 text-xs {isCreatingFolder
            ? 'bg-selected opacity-75'
            : 'bg-hover'}"
        >
          <div class="mr-1.5 flex w-4 shrink-0 items-center justify-center">
            <FileIcon fileName="" isDirectory={true} size="text-xs" />
          </div>
          <input
            bind:this={folderNameInput}
            bind:value={placeholderName}
            oninput={handlePlaceholderNameChange}
            onkeydown={handleFolderNameKeydown}
            onblur={handleFolderNameBlur}
            disabled={isCreatingFolder}
            class="bg-input-background border-accent text-foreground focus:ring-accent/50 flex-1 rounded border bg-transparent px-1 py-0 text-xs focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
          <TreeNode node={child} level={level + 1} {compactMode} />
        {/each}
      {/if}
    </div>
  {/if}
</div>
