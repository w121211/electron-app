<!-- src/renderer/src/components/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { projectService } from "../services/project-service.js";
  import { taskService } from "../services/task-service.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ChatPanel from "./ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";

  const logger = new Logger({ name: "MainLayout" });

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    async function initializeData(): Promise<void> {
      logger.info("MainLayout mounted, initializing app data...");

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

<div class="bg-background text-foreground flex h-screen font-sans">
  <!-- Left Panel: File Explorer -->
  <ExplorerPanel />

  <!-- Center Panel: Chat Interface -->
  <ChatPanel />

  <!-- Right Panel: Controls & Preview -->
  <RightPanel />
</div>
