<!-- src/renderer/src/components-new-ui/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { projectService } from "../services/project-service.js";
  import { taskService } from "../services/task-service.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ChatPanel from "./ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";

  const logger = new Logger({ name: "NewMainLayout" });

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    async function initializeData(): Promise<void> {
      logger.info("New MainLayout mounted, initializing app data...");

      try {
        // Initialize core application data
        await Promise.all([
          projectService.loadProjectFolders(),
          taskService.getAllTasks(),
        ]);

        logger.info("App data initialization complete");
      } catch (error) {
        logger.error("Failed to initialize app data:", error);
      }
    }

    initializeData();
  });
</script>

<div
  class="bg-background text-foreground h-screen overflow-hidden font-sans text-[14px]"
>
  <div class="flex h-screen">
    <!-- Sidebar -->
    {#if uiState.leftPanelOpen}
      <ExplorerPanel />
    {/if}

    <!-- Main Workspace -->
    <main class="flex min-w-0 flex-1">
      <!-- Chat Conversation Panel -->
      <ChatPanel />

      <!-- Right Panel -->
      {#if uiState.rightPanelOpen}
        <RightPanel />
      {/if}
    </main>
  </div>
</div>
