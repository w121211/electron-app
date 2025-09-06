<!-- src/renderer/src/components/file-explorer/ExplorerPanel.svelte -->
<script lang="ts">
  import { PlusLg, Gear, FolderPlus } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { uiState, showToast } from "../../stores/ui-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { chatService } from "../../services/chat-service.js";
  import { userSettingsService } from "../../services/user-settings-service.js";
  import {
    showContextMenu,
    startInlineNewProjectFolderCreation,
    fileExplorerState,
    cancelInlineNewProjectFolderCreation,
    setWorkspaceSetupNeeded,
  } from "../../stores/file-explorer-store.svelte.js";
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import RenameDialog from "./RenameDialog.svelte";
  import UserSettings from "../UserSettings.svelte";

  const logger = new Logger({ name: "ExplorerPanel" });

  // Derived loading states
  const isLoadingAddProjectFolder = $derived(
    uiState.loadingStates["addProjectFolder"] || false,
  );
  const isLoadingCreateNewProjectFolder = $derived(
    uiState.loadingStates["createNewProjectFolder"] || false,
  );
  const isLoadingProjectFolders = $derived(
    uiState.loadingStates["projectFolders"] || false,
  );
  const isLoadingCreateChat = $derived(
    uiState.loadingStates["createChat"] || false,
  );

  let showSettings = $state(false);
  let newProjectFolderInput = $state<HTMLInputElement>();

  // Focus the input when inline creation becomes active
  $effect(() => {
    if (
      fileExplorerState.inlineNewProjectFolder.isActive &&
      newProjectFolderInput
    ) {
      newProjectFolderInput.focus();
      newProjectFolderInput.select();
    }
  });

  async function handleAddProjectFolder(): Promise<void> {
    const folderPath = await window.api.showOpenDialog();
    if (!folderPath) return;

    await projectService.addProjectFolder(folderPath);
  }

  function handleNewProjectFolder(): void {
    startInlineNewProjectFolderCreation();
  }

  async function handleNewChat(targetPath: string): Promise<void> {
    await chatService.createEmptyChat(targetPath);
  }

  /**
   * Handle tree node clicks - now delegates to service layer
   * Service will handle the business logic of what to do with different file types
   */
  async function handleNodeClick(node: any): Promise<void> {
    try {
      await projectService.handleTreeNodeClick(node);
    } catch (error) {
      logger.error("Failed to handle node click:", error);
      // Error handling is already done in service, but log here for debugging
    }
  }

  function handleContextMenu(
    path: string,
    isDirectory: boolean,
    event: MouseEvent,
    isProjectFolder = false,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    // Use store function directly
    showContextMenu(
      path,
      isDirectory,
      event.clientX,
      event.clientY,
      isProjectFolder,
    );
  }

  function handleStopTask(path: string): void {
    showToast("Stop task functionality coming soon", "info");
  }

  function handleOpenSettings(): void {
    showSettings = true;
  }

  function handleCancelNewProjectFolder(): void {
    cancelInlineNewProjectFolderCreation();
  }

  async function handleKeydownNewProjectFolder(
    event: KeyboardEvent,
  ): Promise<void> {
    if (event.key === "Escape") {
      handleCancelNewProjectFolder();
    } else if (event.key === "Enter") {
      const folderName =
        fileExplorerState.inlineNewProjectFolder.placeholderName.trim();
      if (folderName) {
        // handleCreateNewProjectFolder(folderName);
        await projectService.createNewProjectFolder(folderName);
        cancelInlineNewProjectFolderCreation();
      }
    }
  }

  async function handleSetupWorkspace(): Promise<void> {
    const result = await userSettingsService.setupWorkspaceDirectory();
    if (result) {
      setWorkspaceSetupNeeded(false);
      showToast("Workspace directory set successfully", "success");
    }
  }
</script>

<div class="bg-surface border-border flex h-full w-64 flex-col border-r">
  <!-- Header -->
  <div class="border-border flex items-center justify-between border-b p-3">
    <span class="text-muted text-xs font-semibold tracking-wide uppercase">
      Projects
    </span>
    <div class="flex items-center gap-1">
      <button
        onclick={handleAddProjectFolder}
        disabled={isLoadingAddProjectFolder}
        class="text-muted hover:text-accent p-1 disabled:opacity-50"
        title="Add Existing Project"
      >
        <PlusLg class="text-base" />
      </button>
      <button
        onclick={handleNewProjectFolder}
        disabled={isLoadingCreateNewProjectFolder}
        class="text-muted hover:text-accent p-1 disabled:opacity-50"
        title="Create New Project"
      >
        <FolderPlus class="text-base" />
      </button>
    </div>
  </div>

  <!-- Tree Content -->
  <div class="flex-1 overflow-y-auto p-1">
    {#if isLoadingProjectFolders}
      <div class="text-muted p-4 text-sm">Loading project folders...</div>
    {:else}
      <!-- Workspace Setup Prompt -->
      {#if fileExplorerState.workspaceSetup.needsSetup}
        <div class="bg-accent/10 border-accent/30 mx-1 mb-2 rounded border p-3">
          <div class="text-accent mb-2 text-sm font-medium">Setup Required</div>
          <div class="text-muted mb-3 text-xs">
            Set a workspace directory to create new project folders.
          </div>
          <button
            onclick={handleSetupWorkspace}
            class="bg-accent text-accent-foreground hover:bg-accent/80 rounded px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Select Workspace Folder
          </button>
        </div>
      {/if}

      <!-- Inline New Project Folder Creation -->
      {#if fileExplorerState.inlineNewProjectFolder.isActive}
        <div class="flex items-center gap-1 px-2 py-1">
          <FileIcon fileName="" isDirectory={true} size={14} />
          <input
            bind:this={newProjectFolderInput}
            type="text"
            bind:value={
              fileExplorerState.inlineNewProjectFolder.placeholderName
            }
            onkeydown={handleKeydownNewProjectFolder}
            onblur={handleCancelNewProjectFolder}
            class="border-border bg-background text-foreground focus:border-accent flex-1 rounded border px-1 py-0.5 text-sm focus:outline-none"
          />
        </div>
      {/if}

      {#if projectState.projectFolders.length === 0 && !fileExplorerState.inlineNewProjectFolder.isActive}
        <div class="text-muted p-4 text-center text-sm">
          <FileIcon
            fileName=""
            isDirectory={true}
            size={36}
            className="mx-auto mb-2"
          />
          <p>No project folders</p>
          <p class="mt-1 text-xs">Add a project folder to get started</p>
        </div>
      {:else}
        {#each projectState.projectFolders as folder, index (index)}
          {@const tree = projectState.folderTrees[folder.path]}
          {#if tree}
            <TreeNode
              node={tree}
              level={0}
              isCreatingChat={isLoadingCreateChat}
              onclick={handleNodeClick}
              onNewChat={handleNewChat}
              onContextMenu={handleContextMenu}
              onStopTask={handleStopTask}
            />
          {/if}
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Connection Status -->
  <div class="border-border border-t p-3">
    <div class="text-muted space-y-1 text-xs">
      <div class="flex items-center">
        <div
          class="mr-2 h-2 w-2 rounded-full {uiState.connectionStates
            .fileWatcher === 'connected'
            ? 'bg-green-500'
            : uiState.connectionStates.fileWatcher === 'connecting'
              ? 'bg-yellow-500'
              : uiState.connectionStates.fileWatcher === 'error'
                ? 'bg-red-500'
                : 'bg-muted'}"
        ></div>
        File watcher: {uiState.connectionStates.fileWatcher}
      </div>
      <div class="flex items-center">
        <div
          class="mr-2 h-2 w-2 rounded-full {uiState.connectionStates
            .taskEvents === 'connected'
            ? 'bg-green-500'
            : uiState.connectionStates.taskEvents === 'connecting'
              ? 'bg-yellow-500'
              : uiState.connectionStates.taskEvents === 'error'
                ? 'bg-red-500'
                : 'bg-muted'}"
        ></div>
        Task events: {uiState.connectionStates.taskEvents}
      </div>
    </div>
  </div>

  <!-- Settings -->
  <div class="border-border border-t p-3">
    <button
      onclick={handleOpenSettings}
      class="text-muted hover:text-accent flex w-full cursor-pointer items-center justify-center px-3 py-2 text-xs font-medium"
    >
      <Gear class="mr-2 text-sm" />
      Settings
    </button>
  </div>

  <!-- Context Menu -->
  <ContextMenu />

  <!-- Rename Dialog -->
  <RenameDialog />

  <!-- Settings Modal -->
  {#if showSettings}
    <UserSettings {showSettings} onClose={() => (showSettings = false)} />
  {/if}
</div>
