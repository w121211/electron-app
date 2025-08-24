<!-- src/renderer/src/components/file-explorer/TreeNode.svelte -->
<script lang="ts">
  import {
    ChevronDown,
    ChevronRight,
    ThreeDotsVertical,
    ChatDots,
    StopFill,
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
  import {
    fileExplorerState,
    cancelInlineFolderCreation,
    updateInlineFolderName,
  } from "../../stores/file-explorer-store.svelte.js";
  import { fileExplorerService } from "../../services/file-explorer-service.js";
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import type { FolderTreeNode } from "../../stores/project-store.svelte.js";

  interface TreeNodeProps {
    node: FolderTreeNode;
    level: number;
    isCreatingChat?: boolean;
    onclick: (node: FolderTreeNode) => void;
    onNewChat: (path: string) => void;
    onContextMenu: (
      path: string,
      isDirectory: boolean,
      event: MouseEvent,
    ) => void;
    onStopTask?: (path: string) => void;
  }

  let {
    node,
    level,
    isCreatingChat = false,
    onclick,
    onNewChat,
    onContextMenu,
    onStopTask,
  }: TreeNodeProps = $props();

  // Computed values from stores
  const isExpanded = $derived(treeState.expandedNodePaths.includes(node.path));
  const isSelected = $derived(treeState.selectedNode === node.path);
  const task = $derived(tasksByPath.get(node.path));
  const isTaskDir = $derived(isTaskFolder(node.name));

  // Inline folder creation state
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

  // Drag and drop computed values
  const isDragged = $derived(treeState.draggedNode === node.path);

  // Highlight logic for drop zones
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
    onclick(node);
  }

  function handleNewChat(e: MouseEvent): void {
    e.stopPropagation();
    onNewChat(node.path);
  }

  function handleContextMenu(e: MouseEvent): void {
    console.log("🌳 TreeNode handleContextMenu called for:", node.path);
    e.stopPropagation();
    onContextMenu(node.path, node.isDirectory, e);
  }

  function handleStopTask(e: MouseEvent): void {
    e.stopPropagation();
    if (onStopTask) {
      onStopTask(node.path);
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

  function getTaskStatusConfig(status: string): {
    label: string;
    className: string;
  } {
    const configs = {
      COMPLETED: {
        label: "completed",
        className: "bg-green-600/20 text-green-400 border-green-600/40",
      },
      IN_PROGRESS: {
        label: "running",
        className: "bg-blue-600/20 text-blue-400 border-blue-600/40",
      },
      CREATED: {
        label: "created",
        className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
      },
      INITIALIZED: {
        label: "ready",
        className: "bg-purple-600/20 text-purple-400 border-purple-600/40",
      },
    };
    return configs[status as keyof typeof configs] || configs.CREATED;
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent): void {
    if (!e.dataTransfer) return;

    startDrag(node.path);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.path);

    // Set custom drag image (optional)
    const dragElement = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(dragElement, 10, 10);
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
    // Only clear drop target if we're actually leaving this element
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
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

    // Perform the move operation
    const fileName = draggedPath.split("/").pop() || "";
    const newPath = targetPath + "/" + fileName;

    projectService.moveFile(draggedPath, newPath).catch((error) => {
      console.error("Failed to move file:", error);
    });

    clearDragState();
  }

  function handleDragEnd(): void {
    clearDragState();
  }

  // Inline folder creation handlers
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
    // Prevent duplicate creation if already in progress
    if (isCreatingFolder) {
      return;
    }

    if (placeholderName.trim()) {
      handleCreateFolder();
    } else {
      handleCancelFolderCreation();
    }
  }

  async function handleCreateFolder(): Promise<void> {
    const trimmedName = placeholderName.trim();
    if (!trimmedName || isCreatingFolder) {
      if (!trimmedName) {
        handleCancelFolderCreation();
      }
      return;
    }

    isCreatingFolder = true;
    try {
      const result = await fileExplorerService.createFolderInline(
        node.path,
        trimmedName,
      );
      if (result.success) {
        // Success - service already handled closing the placeholder
        console.log("Folder created successfully");
      } else {
        // Error - keep placeholder open, user can try again
        console.error("Failed to create folder:", result.error);
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      isCreatingFolder = false;
    }
  }

  function handleCancelFolderCreation(): void {
    cancelInlineFolderCreation();
  }

  // Update placeholder name when input changes
  function handlePlaceholderNameChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    placeholderName = target.value;
    updateInlineFolderName(target.value);
  }

  // Auto-focus the input when placeholder appears
  $effect(() => {
    if (showPlaceholderFolder && folderNameInput) {
      setTimeout(() => {
        folderNameInput?.focus();
        folderNameInput?.select();
      }, 10);
    }
  });
</script>

<div>
  <!-- Node Row -->
  <div
    role="button"
    tabindex="0"
    draggable="true"
    class="group flex min-h-[28px] w-full cursor-pointer items-center rounded px-1 py-0.5 text-[13px] {isSelected
      ? 'bg-selected text-foreground'
      : 'hover:bg-hover text-foreground'} {isDragged
      ? 'opacity-50'
      : ''} {shouldHighlightFolder || shouldHighlightAsFileLevel
      ? 'bg-hover'
      : ''}"
    style="padding-left: {level * 16 + 8}px"
    onclick={handleNodeClick}
    onkeydown={handleKeydown}
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    ondragend={handleDragEnd}
  >
    <!-- Expand/Collapse Arrow -->
    {#if node.isDirectory}
      <div class="mr-1 h-4 w-4">
        {#if isExpanded}
          <ChevronDown class="text-muted text-sm" />
        {:else}
          <ChevronRight class="text-muted text-sm" />
        {/if}
      </div>
    {/if}

    <!-- File Icon -->
    <div class="mr-2">
      <FileIcon
        fileName={node.name}
        isDirectory={node.isDirectory}
        {isExpanded}
      />
    </div>

    <!-- File Name -->
    <span class="flex-1 truncate text-sm">{node.name}</span>

    <!-- Task Status Badge -->
    {#if isTaskDir && task}
      {@const statusConfig = getTaskStatusConfig(task.status)}
      <span
        class="ml-2 rounded border px-2 py-0.5 font-mono text-xs {statusConfig.className}"
      >
        {statusConfig.label}
      </span>

      {#if task.status === "IN_PROGRESS" && onStopTask}
        <button
          onclick={handleStopTask}
          class="text-muted ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400"
          title="Stop Task"
        >
          <StopFill class="text-xs" />
        </button>
      {/if}
    {/if}

    <!-- Actions -->
    <div class="flex items-center">
      <!-- New Chat Button for Directories -->
      {#if node.isDirectory}
        <button
          onclick={handleNewChat}
          disabled={isCreatingChat}
          class="hover:bg-hover mr-1 cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100 disabled:opacity-30"
          title="New Chat"
        >
          <ChatDots class="text-muted hover:text-accent text-xs" />
        </button>
      {/if}

      <!-- Context Menu Button -->
      <button
        onclick={handleContextMenu}
        class="hover:bg-hover cursor-pointer rounded p-1 opacity-0 group-hover:opacity-100"
        title="More options"
      >
        <ThreeDotsVertical class="text-muted text-xs" />
      </button>
    </div>
  </div>

  <!-- Children -->
  {#if node.isDirectory && isExpanded}
    <!-- Placeholder folder creation input -->
    {#if showPlaceholderFolder}
      <div
        class="flex min-h-[28px] w-full items-center rounded px-1 py-0.5 text-[13px] {isCreatingFolder
          ? 'bg-selected opacity-75'
          : 'bg-hover'}"
        style="padding-left: {(level + 1) * 16 + 8}px"
      >
        <!-- Folder Icon -->
        <div class="mr-2">
          <FileIcon fileName="" isDirectory={true} isExpanded={false} />
        </div>

        <!-- Input Field -->
        <input
          bind:this={folderNameInput}
          bind:value={placeholderName}
          oninput={handlePlaceholderNameChange}
          onkeydown={handleFolderNameKeydown}
          onblur={handleFolderNameBlur}
          disabled={isCreatingFolder}
          class="bg-input-background border-accent text-foreground focus:ring-accent/50 flex-1 rounded border px-1 py-0 text-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          type="text"
          placeholder="Folder name"
        />

        <!-- Loading indicator -->
        {#if isCreatingFolder}
          <div
            class="border-accent ml-2 h-3 w-3 animate-spin rounded-full border border-t-transparent"
          ></div>
        {/if}
      </div>
    {/if}

    <!-- Regular children -->
    {#if node.children}
      {#each node.children as child (child.path)}
        <TreeNode
          node={child}
          level={level + 1}
          {isCreatingChat}
          {onclick}
          {onNewChat}
          {onContextMenu}
          {onStopTask}
        />
      {/each}
    {/if}
  {/if}
</div>
