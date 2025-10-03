<!-- src/renderer/src/components/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { projectService } from "../services/project-service.js";
  // import { taskService } from "../services/task-service.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import { treeState } from "../stores/tree-store.svelte.js";
  import { getActiveEditorContext } from "../stores/ui.svelte.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ChatPanel from "./chat/ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";
  import QuickLauncher from "./QuickLauncher.svelte";
  import FilePanel from "./FilePanel.svelte";
  import PromptEditor from "./chat/PromptEditor.svelte";
  import PtyChatPanel from "./pty-chat/PtyChatPanel.svelte";
  import { documentService } from "../services/document-service.js";

  const logger = new Logger({ name: "NewMainLayout" });

  type CenterPanelView =
    | "welcome"
    | "apiChatPanel"
    | "filePanel"
    | "ptyChatPanel"
    | "promptEditor";

  const editorContext = $derived.by(getActiveEditorContext);

  // const chatSession = $derived(getLinkedChatSession(filePath));
  // const editorView = $derived(editorViews.get(filePath));

  const centerPanelView: CenterPanelView = $derived.by(() => {
    if (editorContext?.chatSessionState) {
      if (editorContext.chatSessionState.data.sessionType === "pty_chat") {
        return "ptyChatPanel";
      } else if (
        editorContext.chatSessionState.data.sessionType === "chat_engine"
      ) {
        return "apiChatPanel";
      } else {
        throw new Error(
          "Unhandled chat session type" +
            editorContext.chatSessionState.data.sessionType,
        );
      }
    }

    // Prompt script has no lnked chat session
    if (editorContext?.documentState?.kind === "promptScript") {
      return "promptEditor";
    }

    if (editorContext?.documentState) {
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

  $inspect(editorContext);
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
      {#if centerPanelView === "apiChatPanel"}
        <ChatPanel />
      {:else if centerPanelView === "promptEditor" && editorContext?.filePath}
        <PromptEditor
          filePath={editorContext.filePath}
          onClose={() => documentService.closeDocument(editorContext.filePath)}
        />
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
