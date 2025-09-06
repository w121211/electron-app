<!-- src/renderer/src/components-new-ui/file-explorer/TreeNode.svelte -->
<script lang="ts">
  import {
    ChevronDown,
    ChevronRight,
    ThreeDotsVertical,
    ChatDots,
    StopFill,
    ArrowClockwise,
    PlayFill,
    FileEarmark,
    FileEarmarkCheck,
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
  import { uiState } from "../../stores/ui-store.svelte.js";
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
      isProjectFolder?: boolean,
    ) => void;
    onStopTask?: (path: string) => void;
    compactMode?: boolean;
  }

  let {
    node,
    level,
    isCreatingChat = false,
    onclick,
    onNewChat,
    onContextMenu,
    onStopTask,
    compactMode = false,
  }: TreeNodeProps = $props();

  // Computed values from stores
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
    onContextMenu(node.path, node.isDirectory, e, isProjectFolder);
  }

  function handleStopTask(e: MouseEvent): void {
    e.stopPropagation();
    if (onStopTask) {
      onStopTask(node.path);
    }
  }

  async function handleRerunChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isChatFile) return;

    try {
      // If this chat file is not currently open, open it first
      if (!isCurrentChatFile) {
        await chatService.openChatFile(node.path);
      }

      // Now rerun the chat
      const currentChat = chatState.currentChat;
      if (currentChat) {
        await chatService.rerunChat(
          currentChat.absoluteFilePath,
          currentChat.id,
        );
      }
    } catch (error) {
      // Error handling is done in the service
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

  function getChatStatusConfig(sessionStatus: string): {
    label: string;
    className: string;
  } {
    const configs = {
      processing: {
        label: "running",
        className: "text-foreground border-border bg-surface",
      },
      waiting_confirmation: {
        label: "paused",
        className: "text-foreground border-border bg-surface",
      },
      idle: {
        label: "idle",
        className: "text-foreground border-border bg-surface",
      },
    };
    return configs[sessionStatus as keyof typeof configs] || configs.idle;
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

  // Auto-focus the input when placeholder appears
  $effect(() => {
    if (showPlaceholderFolder && folderNameInput) {
      setTimeout(() => {
        folderNameInput?.focus();
        folderNameInput?.select();
      }, 10);
    }
  });

  // Skip rendering for level 0 - parent component handles it
  const shouldRenderChildren = $derived(level > 0);
</script>

{#if shouldRenderChildren}
  <!-- Children nodes only (skip level 0 root) -->
  {#if node.children && isExpanded}
    {#each node.children as child (child.path)}
      {#if compactMode}
        <!-- Compact mode for new UI design -->
        {#if child.isDirectory}
          <!-- Nested Folder -->
          <div>
            <div
              class="hover:bg-hover group relative flex min-h-[24px] cursor-pointer items-center rounded px-1 py-0.5 text-sm font-[400] transition-colors"
              role="button"
              tabindex="0"
              onclick={() => onclick(child)}
              onkeydown={(e) =>
                (e.key === "Enter" || e.key === " ") && onclick(child)}
            >
              <ChevronDown class="text-muted mr-2 text-xs" />
              <span class="text-xs">{child.name}</span>
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  onNewChat(child.path);
                }}
                class="text-muted hover:text-accent mr-1 ml-auto cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
                title="New Chat"
              >
                <ChatDots class="text-xs" />
              </button>
              <button
                onclick={(e) => handleContextMenu(e)}
                class="text-muted hover:text-accent cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
                title="Menu"
              >
                <ThreeDotsVertical class="text-xs" />
              </button>
            </div>
            <div class="ml-2 pl-0">
              <!-- Recursively render nested children -->
              <TreeNode
                node={child}
                level={level + 1}
                {isCreatingChat}
                {onclick}
                {onNewChat}
                {onContextMenu}
                {onStopTask}
                {compactMode}
              />
            </div>
          </div>
        {:else}
          <!-- File Item -->
          <div
            class="hover:bg-hover group relative flex min-h-[24px] cursor-pointer items-center rounded px-1 py-0.5 text-sm font-[400] transition-colors {isSelected
              ? 'bg-selected'
              : ''}"
            role="button"
            tabindex="0"
            onclick={() => onclick(child)}
            onkeydown={(e) =>
              (e.key === "Enter" || e.key === " ") && onclick(child)}
          >
            {#if child.name.endsWith(".chat.json")}
              <ChatDots class="text-muted mr-1.5 text-xs" />
            {:else}
              <FileEarmark class="text-muted mr-1.5 text-xs" />
            {/if}
            <span class="max-w-[120px] truncate text-xs">{child.name}</span>

            <!-- Chat status badge -->
            {#if child.name.endsWith(".chat.json") && isCurrentChatFile}
              {@const sessionStatus =
                chatState.currentChat?.sessionStatus || "idle"}
              {@const statusConfig = getChatStatusConfig(sessionStatus)}
              <span
                class="ml-1 rounded border px-1 py-0.5 font-mono text-[10px] {statusConfig.className}"
              >
                {statusConfig.label}
              </span>
            {/if}

            <!-- Context indicator -->
            {#if !child.name.endsWith(".chat.json")}
              <FileEarmarkCheck
                class="text-muted ml-1 text-[10px]"
                title="In Project Context"
              />
            {/if}

            <!-- Action buttons -->
            {#if child.name.endsWith(".chat.json")}
              {@const sessionStatus =
                chatState.currentChat?.sessionStatus || "idle"}
              {#if sessionStatus === "processing"}
                <button
                  onclick={(e) => handleStopTask(e)}
                  class="text-muted hover:text-accent mr-1 ml-auto cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
                  title="Stop Chat"
                >
                  <StopFill class="text-xs" />
                </button>
              {:else if sessionStatus === "paused"}
                <button
                  onclick={(e) => handleRerunChat(e)}
                  class="text-muted hover:text-accent mr-1 ml-auto cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
                  title="Resume Chat"
                >
                  <PlayFill class="text-xs" />
                </button>
              {/if}
            {/if}

            <button
              onclick={(e) => handleContextMenu(e)}
              class="text-muted hover:text-accent ml-auto cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
              title="Menu"
            >
              <ThreeDotsVertical class="text-xs" />
            </button>
          </div>
        {/if}
      {:else}
        <!-- Standard mode (fallback to original design) -->
        <TreeNode
          node={child}
          level={level + 1}
          {isCreatingChat}
          {onclick}
          {onNewChat}
          {onContextMenu}
          {onStopTask}
          {compactMode}
        />
      {/if}
    {/each}
  {/if}
{/if}
