<!-- src/renderer/src/components/file-explorer/TreeNode.svelte -->
<script lang="ts">
  import {
    ThreeDotsVertical,
    ChatDots,
    PlayFill,
    StopFill,
  } from "svelte-bootstrap-icons";
  import {
    treeState,
    startDrag,
    setDropTarget,
    clearDragState,
    canDropOn,
  } from "../../stores/tree-store.svelte.js";

  import { projectService } from "../../services/project-service.js";
  import { getChatSessionByPromptScriptPath } from "../../stores/ui.svelte.js";
  import { uiState } from "../../stores/ui-store.svelte.js";
  import {
    fileExplorerState,
    cancelInlineFolderCreation,
    updateInlineFolderName,
    showContextMenu,
  } from "../../stores/file-explorer-store.svelte.js";
  import { fileExplorerService } from "../../services/file-explorer-service.js";
  import { documentClientService } from "../../services/document-client-service.js";
  import type { ChatState } from "../../../../core/services/chat/chat-session-repository.js";
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import type { FolderTreeNode } from "../../stores/project-store.svelte.js";

  interface TreeNodeProps {
    node: FolderTreeNode;
    level: number;
  }

  let { node, level }: TreeNodeProps = $props();

  const isExpanded = $derived(treeState.expandedNodePaths.includes(node.path));
  const isSelected = $derived(treeState.selectedNode === node.path);

  const isProjectFolder = $derived(level === 0);

  const isPromptScript = $derived(node.name.endsWith(".prompt.md"));
  const linkedChatSession = $derived(
    isPromptScript ? getChatSessionByPromptScriptPath(node.path) : null,
  );
  const chatState: ChatState | undefined = $derived(
    linkedChatSession?.data.state,
  );

  const isLoadingStopChat = $derived(
    uiState.loadingStates["stopChat"] || false,
  );
  const isLoadingRunChat = $derived(
    uiState.loadingStates["runChat"] || false,
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
  let isCreatingPromptScript = $state(false);

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

  async function handleCreatePromptScript(e: MouseEvent): Promise<void> {
    e.stopPropagation();

    if (isCreatingPromptScript) {
      return;
    }
    isCreatingPromptScript = true;

    try {
      const script = await documentClientService.createPromptScript(node.path);
      await projectService.refreshProjectTreeForFile(script.absolutePath);
      await projectService.selectFile(script.absolutePath);
    } catch (error) {
      console.error("Failed to create prompt script:", error);
    } finally {
      isCreatingPromptScript = false;
    }
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

  async function handleRunChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript) return;
    // TODO: Implement run chat functionality
  }

  async function handleStopChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript) return;
    // TODO: Implement stop chat functionality
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNodeClick();
    }
  }



  function getChatStatusConfig(state: ChatState): { label: string | null } {
    switch (state) {
      case "active:generating":
        return { label: "generating" };
      case "active:awaiting_input":
        return { label: "awaiting" };
      case "queued":
        return { label: "queued" };
      case "active":
        return { label: "active" };
      case "active:disconnected":
        return { label: "disconnected" };
      case "terminated":
      default:
        return { label: null };
    }
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
    class="group relative flex min-h-[24px] w-full cursor-pointer items-center rounded py-0.5 text-sm transition-colors font-[400]
      {isSelected ? 'bg-selected' : 'hover:bg-hover'}
      {isProjectFolder ? '' : 'text-foreground px-1'}
      {isDragged ? 'opacity-50' : ''}
      {shouldHighlightFolder || shouldHighlightAsFileLevel ? 'bg-hover' : ''}"
    style="padding-left: {level * 12}px;"
    onclick={handleNodeClick}
    onkeydown={handleKeydown}
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    ondragend={handleDragEnd}
  >
    {#if isPromptScript && chatState === "active:awaiting_input"}
      <div class="absolute -left-1 top-1/2 -translate-y-1/2">
        <div
          class="h-1.5 w-1.5 rounded-full bg-accent"
          title="Awaiting Input"
        ></div>
      </div>
    {/if}

    <!-- Icon -->
    <div class="mr-1.5 flex w-4 shrink-0 items-center justify-center">
      <FileIcon
        fileName={node.name}
        isDirectory={node.isDirectory}
        isExpanded={isExpanded}
        size={12}
      />
    </div>

    <!-- Name -->
    <span class="flex-1 truncate text-xs" title={node.name}>{node.name}</span>

    <!-- Statuses -->

    {#if isPromptScript && chatState}
      {@const statusConfig = getChatStatusConfig(chatState)}
      {#if statusConfig.label}
        <span
          class="border-border text-foreground ml-1 rounded border px-1 py-0.5 font-mono text-[10px]"
        >
          {statusConfig.label}
        </span>
      {/if}
    {/if}

    <!-- Actions -->
    <div
      class="ml-auto flex items-center pl-1 opacity-0 group-hover:opacity-100"
    >
      {#if isPromptScript && chatState === "terminated"}
        <button
          onclick={handleRunChat}
          disabled={isLoadingRunChat}
          class="text-muted hover:text-accent mr-1 cursor-pointer p-0.5 disabled:opacity-50"
          title="Run Chat"
        >
          <PlayFill class="text-xs" />
        </button>
      {/if}
      {#if isPromptScript && chatState === "active:generating"}
        <button
          onclick={handleStopChat}
          disabled={isLoadingStopChat}
          class="text-muted hover:text-accent mr-1 cursor-pointer p-0.5 disabled:opacity-50"
          title="Stop Chat"
        >
          <StopFill class="text-xs" />
        </button>
      {/if}
      {#if node.isDirectory}
        <button
          onclick={handleCreatePromptScript}
          disabled={isCreatingPromptScript}
          class="text-muted hover:text-accent mr-1 cursor-pointer p-0.5 disabled:opacity-30"
          title="New Prompt Script"
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
    <div class="ml-2 space-y-0.5">
      {#if showPlaceholderFolder}
        <div
          class="flex min-h-[24px] w-full items-center rounded px-1 py-1 text-sm {isCreatingFolder
            ? 'bg-selected opacity-75'
            : 'bg-hover'}"
        >
          <div class="mr-1.5 flex w-4 shrink-0 items-center justify-center">
            <FileIcon fileName="" isDirectory={true} size={12} />
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
