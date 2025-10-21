<!-- src/renderer/src/components/file-explorer/ExplorerPanel.svelte -->
<script lang="ts">
  import {
    House,
    Search,
    LayoutSidebar,
    Plus,
    ThreeDotsVertical,
    // ChevronDown, // COMMENTED OUT: New project folder not needed
    Gear,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { projectState } from "../../stores/project-store.svelte.js";
  import {
    uiState,
    // showToast, // COMMENTED OUT: Workspace setup not needed
    toggleLeftPanel,
  } from "../../stores/ui-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  // import { userSettingsService } from "../../services/user-settings-service.js"; // COMMENTED OUT: Workspace setup not needed
  import {
    // @ts-expect-error - Intentionally unused for future use
    showContextMenu,
    // startInlineNewProjectFolderCreation, // COMMENTED OUT: New project folder not needed
    fileExplorerState,
    // cancelInlineNewProjectFolderCreation, // COMMENTED OUT: New project folder not needed
    // setWorkspaceSetupNeeded, // COMMENTED OUT: Workspace setup not needed
  } from "../../stores/file-explorer-store.svelte.js";
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import RenameDialog from "./RenameDialog.svelte";
  import UserSettings from "../UserSettings.svelte";
  // import RunningChats from "./RunningChats.svelte";

  // @ts-expect-error - Intentionally unused for future use
  const logger = new Logger({ name: "NewExplorerPanel" });

  // Derived loading states
  const isLoadingAddProjectFolder = $derived(
    uiState.loadingStates["addProjectFolder"] || false,
  );
  // @ts-expect-error - Intentionally unused for future use
  const isLoadingCreateNewProjectFolder = $derived(
    uiState.loadingStates["createNewProjectFolder"] || false,
  );
  const isLoadingProjectFolders = $derived(
    uiState.loadingStates["projectFolders"] || false,
  );

  let showSettings = $state(false);
  // let newProjectFolderInput = $state<HTMLInputElement>(); // COMMENTED OUT: New project folder not needed

  // COMMENTED OUT: New project folder feature not needed
  // $effect(() => {
  //   if (
  //     fileExplorerState.inlineNewProjectFolder.isActive &&
  //     newProjectFolderInput
  //   ) {
  //     newProjectFolderInput.focus();
  //     newProjectFolderInput.select();
  //   }
  // });

  async function handleAddProjectFolder(): Promise<void> {
    const folderPath = await window.api.showOpenDialog();
    if (!folderPath) return;

    await projectService.addProjectFolder(folderPath);
  }

  // COMMENTED OUT: New project folder feature not needed
  // function handleNewProjectFolder(): void {
  //   startInlineNewProjectFolderCreation();
  // }

  function handleOpenSettings(): void {
    showSettings = true;
  }

  // COMMENTED OUT: New project folder feature not needed
  // function handleCancelNewProjectFolder(): void {
  //   cancelInlineNewProjectFolderCreation();
  // }

  // async function handleKeydownNewProjectFolder(
  //   event: KeyboardEvent,
  // ): Promise<void> {
  //   if (event.key === "Escape") {
  //     handleCancelNewProjectFolder();
  //   } else if (event.key === "Enter") {
  //     const folderName =
  //       fileExplorerState.inlineNewProjectFolder.placeholderName.trim();
  //     if (folderName) {
  //       await projectService.createNewProjectFolder(folderName);
  //       cancelInlineNewProjectFolderCreation();
  //     }
  //   }
  // }

  // COMMENTED OUT: Workspace setup not needed
  // async function handleSetupWorkspace(): Promise<void> {
  //   const result = await userSettingsService.setupWorkspaceDirectory();
  //   if (result) {
  //     setWorkspaceSetupNeeded(false);
  //     showToast("Workspace directory set successfully", "success");
  //   }
  // }
</script>

<aside class="bg-background border-border flex w-64 flex-col border-r">
  <!-- Section 1: Top Icons (Fixed) -->
  <div class="flex h-12 items-center justify-start px-4">
    <div class="flex items-center gap-2">
      <button
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
        title="Home"
      >
        <House class="text-base" />
      </button>
      <button
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
        title="Search"
      >
        <Search class="text-base" />
      </button>
      <button
        onclick={toggleLeftPanel}
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
        title="Toggle Sidebar"
      >
        <LayoutSidebar class="text-base" />
      </button>
    </div>
  </div>

  <!-- Section 2: Scrollable Content -->
  <div class="flex-1 overflow-y-auto">
    <div class="px-3">
      <!-- <RunningChats /> -->

      <!-- Projects Header -->
      <div
        class="hover:bg-hover text-muted group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1"
        title="Projects"
      >
        <span class="text-sm font-medium">Projects</span>
        <button
          onclick={handleAddProjectFolder}
          disabled={isLoadingAddProjectFolder}
          class="text-muted hover:text-accent ml-auto cursor-pointer opacity-0 group-hover:opacity-100 disabled:opacity-50"
          title="Add Project Folder"
        >
          <Plus class="text-xs" />
        </button>
        <button
          class="text-muted hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100"
          title="Menu"
        >
          <ThreeDotsVertical class="text-xs" />
        </button>
      </div>

      <!-- Project Trees -->
      <div class="px-2">
        {#if isLoadingProjectFolders}
          <div class="text-muted p-4 text-sm">Loading project folders...</div>
        {:else}
          <!-- COMMENTED OUT: Workspace setup not needed - users can add existing folders -->
          <!-- {#if fileExplorerState.workspaceSetup.needsSetup}
            <div
              class="bg-accent/10 border-accent/30 mx-1 mb-2 rounded border p-3"
            >
              <div class="text-accent mb-2 text-sm font-medium">
                Setup Required
              </div>
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
          {/if} -->

          <!-- COMMENTED OUT: New project folder feature not needed -->
          <!-- {#if fileExplorerState.inlineNewProjectFolder.isActive}
            <div class="pb-1">
              <div
                class="hover:bg-hover group relative flex min-h-[24px] cursor-pointer items-center rounded py-0.5 text-sm font-[400] transition-colors"
              >
                <ChevronDown class="text-muted mr-2 text-xs" />
                <input
                  bind:this={newProjectFolderInput}
                  type="text"
                  bind:value={
                    fileExplorerState.inlineNewProjectFolder.placeholderName
                  }
                  onkeydown={handleKeydownNewProjectFolder}
                  onblur={handleCancelNewProjectFolder}
                  class="border-border text-foreground focus:border-accent flex-1 border-0 bg-transparent px-0 py-0 text-xs font-medium focus:outline-none"
                />
              </div>
            </div>
          {/if} -->

          {#if projectState.projectFolders.length === 0 && !fileExplorerState.inlineNewProjectFolder.isActive}
            <div class="text-muted p-4 text-center text-sm">
              <FileIcon
                fileName=""
                isDirectory={true}
                size={12}
                className="mx-auto mb-2"
              />
              <p>No project folders</p>
              <p class="mt-1 text-xs">Add a project folder to get started</p>
            </div>
          {:else}
            {#each projectState.projectFolders as folder, index (index)}
              {@const tree = projectState.folderTrees[folder.path]}
              {#if tree}
                <TreeNode node={tree} level={0} />
              {/if}
            {/each}
          {/if}
        {/if}
      </div>
    </div>
  </div>

  <!-- Section 3: Bottom Settings (Fixed) -->
  <div class="flex h-12 px-4">
    <button
      onclick={handleOpenSettings}
      class="text-muted hover:text-accent rounded-md p-1.5 hover:cursor-pointer"
      title="Settings"
    >
      <Gear class="text-base" />
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
</aside>
