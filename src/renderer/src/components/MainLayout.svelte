<!-- src/renderer/src/components/MainLayout.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import { projectService } from "../services/project-service.js";

  import { getSelectedDocContext, ui } from "../stores/ui.svelte.js";
  import ExplorerPanel from "./file-explorer/ExplorerPanel.svelte";
  import ChatDashboard from "./chat/ChatDashboard.svelte";
  // import ApiChatPanel from "./chat/ChatPanel.svelte";
  import RightPanel from "./RightPanel.svelte";
  import QuickLauncher from "./QuickLauncher.svelte";
  import FilePanel from "./document/FilePanel.svelte";
  import PromptEditorPanel from "./document/PromptEditorPanel.svelte";
  import PtyChatPanel from "./pty-chat/PtyChatPanel.svelte";

  const logger = new Logger({ name: "NewMainLayout" });

  type CenterPanelView =
    | "dashboard"
    | "apiChatPanel"
    | "ptyChatPanel"
    | "filePanel"
    | "promptEditorPanel";

  const docContext = $derived.by(getSelectedDocContext);

  const centerPanelView: CenterPanelView = $derived.by(() => {
    const scriptLink = docContext?.documentState.data.promptScriptLink;
    const chatSession = docContext?.chatSessionState?.data;

    if (scriptLink) {
      if (chatSession?.modelSurface === "pty") {
        return "ptyChatPanel";
      } else if (chatSession?.modelSurface === "api") {
        return "apiChatPanel";
      } else if (scriptLink.promptScript && !chatSession) {
        return "promptEditorPanel";
      } else {
        throw new Error("Unhandled chat session" + chatSession);
      }
    } else if (docContext?.documentState) {
      return "filePanel";
    }
    return "dashboard";
  });

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    async function initializeData(): Promise<void> {
      // Initialize core application data
      await Promise.all([
        projectService.loadProjectFolders(),
      ]);
      logger.info("App data initialization complete");
    }

    initializeData();
  });

  // $inspect(docContext);
  // $inspect(centerPanelView);
</script>

<div
  class="bg-background text-foreground h-screen overflow-hidden font-sans text-[14px]"
>
  <div class="flex h-screen">
    <!-- Sidebar -->
    {#if ui.leftPanelOpen}
      <ExplorerPanel />
    {/if}

    <!-- Main Workspace -->
    <div class="relative flex flex-1">
      <main class="flex min-w-0 flex-1">
        {#if centerPanelView === "promptEditorPanel"}
          <PromptEditorPanel />
          <!-- {:else if centerPanelView === "apiChatPanel"}
          <ApiChatPanel /> -->
        {:else if centerPanelView === "filePanel"}
          <FilePanel />
        {:else if centerPanelView === "dashboard"}
          <ChatDashboard />
        {/if}

        <!-- Keep PTY terminal mounted so the underlying xterm stream is not disposed while hidden -->
        <PtyChatPanel hidden={centerPanelView !== "ptyChatPanel"} />

        <!-- Right Panel -->
        {#if ui.rightPanelOpen}
          <RightPanel />
        {/if}
      </main>

      <!-- Prompt Editor Overlay -->
      <!-- TODO: Re-evaluate the need for a separate prompt editor overlay. A single, dedicated editor view might be simpler. -->
      {#if ui.promptEditorOpen && centerPanelView !== "promptEditorPanel"}
        <div class="absolute inset-0 z-30 flex">
          <PromptEditorPanel />
        </div>
      {/if}
    </div>
  </div>

  <!-- Quick Launcher Modal -->
  <QuickLauncher />
</div>
