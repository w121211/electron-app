<!-- src/renderer/src/components/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { isTerminalModel } from "../../../core/utils/model-utils.js";
  import { projectService } from "../services/project-service.js";
  // import { taskService } from "../services/task-service.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import { treeState } from "../stores/tree-store.svelte.js";
  import { chatState } from "../stores/chat-store.svelte.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ChatPanel from "./chat/ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";
  import QuickLauncher from "./QuickLauncher.svelte";
  import FilePanel from "./FilePanel.svelte";
  import PtyChatPanel from "./PtyChatPanel.svelte";

  const logger = new Logger({ name: "NewMainLayout" });

  type CenterPanelView = "welcome" | "chat" | "filePanel" | "xterm";

  const centerPanelView: CenterPanelView = $derived.by(() => {
    if (treeState.selectedChatFile) {
      if (
        chatState.currentChat?.modelId &&
        isTerminalModel(chatState.currentChat.modelId)
      ) {
        return "xterm";
      }
      return "chat";
    }

    if (treeState.selectedPreviewFile) {
      return "filePanel";
    }

    return "welcome";
  });

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    async function initializeData(): Promise<void> {
      // Initialize core application data
      await Promise.all([
        projectService.loadProjectFolders(),
        // taskService.getAllTasks(),
      ]);
      logger.info("App data initialization complete");
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
      <!-- Center Panel: Main View -->
      {#if centerPanelView === "chat"}
        <ChatPanel />
      {:else if centerPanelView === "filePanel"}
        <FilePanel />
      {:else if centerPanelView === "xterm"}
        <PtyChatPanel />
      {:else}
        <!-- Welcome Screen / No file open -->
        <div class="bg-surface flex flex-1 items-center justify-center">
          <div class="text-muted text-center">
            <div class="mx-auto mb-4 text-5xl">👋</div>
            <p class="mb-2">Select a file to view or a chat to continue.</p>
            <p class="text-xs opacity-75">
              Create a new chat from the file explorer.
            </p>
          </div>
        </div>
      {/if}

      <!-- Right Panel -->
      {#if uiState.rightPanelOpen}
        <RightPanel />
      {/if}
    </main>
  </div>

  <!-- Quick Launcher Modal -->
  <QuickLauncher />
</div>
