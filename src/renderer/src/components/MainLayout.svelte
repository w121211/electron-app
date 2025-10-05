<!-- src/renderer/src/components/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { projectService } from "../services/project-service.js";
  // import { taskService } from "../services/task-service.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import { treeState } from "../stores/tree-store.svelte.js";
  import { getSelectedDocContext } from "../stores/ui.svelte.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ApiChatPanel from "./chat/ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";
  import QuickLauncher from "./QuickLauncher.svelte";
  import FilePanel from "./document/FilePanel.svelte";
  import PromptEditorPanel from "./document/PromptEditorPanel.svelte";
  import PtyChatPanel from "./pty-chat/PtyChatPanel.svelte";

  const logger = new Logger({ name: "NewMainLayout" });

  type CenterPanelView =
    | "welcome"
    | "apiChatPanel"
    | "ptyChatPanel"
    | "filePanel"
    | "promptEditorPanel";

  const selectedDocContext = $derived.by(getSelectedDocContext);

  // const chatSession = $derived(getLinkedChatSession(filePath));
  // const editorView = $derived(editorViews.get(filePath));

  const centerPanelView: CenterPanelView = $derived.by(() => {
    if (selectedDocContext?.chatSessionState) {
      if (selectedDocContext.chatSessionState.data.sessionType === "pty_chat") {
        return "ptyChatPanel";
      } else if (
        selectedDocContext.chatSessionState.data.sessionType === "chat_engine"
      ) {
        return "apiChatPanel";
      } else {
        throw new Error(
          "Unhandled chat session type" +
            selectedDocContext.chatSessionState.data.sessionType,
        );
      }
    }

    // Prompt script has no lnked chat session
    if (selectedDocContext?.documentState?.data.kind === "promptScript") {
      return "promptEditorPanel";
    }

    if (selectedDocContext?.documentState) {
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

  $inspect(selectedDocContext);
  $inspect(centerPanelView);
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
      {#if centerPanelView === "promptEditorPanel"}
        <PromptEditorPanel />
      {:else if centerPanelView === "apiChatPanel"}
        <ApiChatPanel />
      {:else if centerPanelView === "filePanel"}
        <FilePanel />
      {:else if centerPanelView === "welcome"}
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

      <!-- Keep PTY terminal mounted so the underlying xterm stream is not disposed while hidden -->
      <PtyChatPanel hidden={centerPanelView !== "ptyChatPanel"} />

      <!-- Right Panel -->
      {#if uiState.rightPanelOpen}
        <RightPanel />
      {/if}
    </main>
  </div>

  <!-- Quick Launcher Modal -->
  <QuickLauncher />
</div>
