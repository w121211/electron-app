<!-- src/renderer/src/components/pty-chat/PtyChatPanel.svelte -->
<script lang="ts">
  // import { chatState } from "../../stores/chat-store.svelte.js";
  import { uiState } from "../../stores/ui-store.svelte.js";
  import Breadcrumb from "../Breadcrumb.svelte";
  import PromptEditor from "../chat/PromptEditor.svelte";
  import NavigationButtons from "../NavigationButtons.svelte";
  import PtyStreamPool from "../PtyStreamPool.svelte";
  import {
    type PtyStream,
    ptyStreamManager,
  } from "../../services/pty-stream-manager.js";
  import XtermSnapshot from "../XtermSnapshot.svelte";

  import { Logger } from "tslog"; // Import Logger
  import { getActiveEditorContext } from "../../stores/ui.svelte.js";

  const logger = new Logger({ name: "PtyChatPanel" }); // Initialize logger

  let {
    hidden = false,
  }: {
    hidden?: boolean;
  } = $props();

  let selectedPtyStream: PtyStream | null = $state(null);

  const activeContext = $derived.by(getActiveEditorContext);
  const chatSession = $derived(activeContext?.chatSessionState?.data);

  $inspect(chatSession);
  $inspect(selectedPtyStream);

  $effect(() => {
    const ptyInstanceId = chatSession?.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      selectedPtyStream = ptyStreamManager.getOrAttachStream(ptyInstanceId);
    } else {
      selectedPtyStream = null;
    }
  });

  $effect(() => {
    if (!hidden && chatSession?.sessionType !== "pty_chat") {
      throw new Error(
        "PtyChatPanel requires a PTY chat session but current chat type is: " +
          chatSession?.sessionType,
      );
    }
  });

  // Show prompt editor only for chat draft
  // $effect(() => {
  //   uiState.promptEditorOpen = session?.sessionType === "chat_draft";
  // });

  // Event handlers
  const handleXtermReady = (readyStream: PtyStream): void => {
    logger.info(`Terminal for session ${readyStream.ptySessionId} is ready.`);

    if (
      selectedPtyStream &&
      readyStream.ptySessionId === selectedPtyStream.ptySessionId
    ) {
      const initialCommand =
        chatSession?.metadata?.external?.pty?.initialCommand;

      if (initialCommand) {
        logger.debug(
          `Executing initial command: "${initialCommand}" for session ${readyStream.ptySessionId}`,
        );
        setTimeout(() => {
          readyStream.write(initialCommand + "\n");
        }, 50);
      } else {
        logger.debug(
          `No initial command found for session ${readyStream.ptySessionId}`,
        );
      }
    } else {
      logger.debug(
        `Terminal for session ${readyStream.ptySessionId} is ready, but not the selected stream. Skipping initial command.`,
      );
    }
  };

  // $effect(() => {
  //   console.debug(chatState.currentChat);
  //   console.debug(selectedPtyStream);
  // });
</script>

<section
  class="relative flex min-w-0 flex-1 flex-col"
  class:bg-surface={uiState.promptEditorOpen}
  class:hidden
>
  <!-- Header with Breadcrumb -->
  <header class="flex h-12 items-center justify-between px-4">
    <div class="flex items-center gap-1">
      <NavigationButtons />

      {#if activeContext}
        <div class={!uiState.leftPanelOpen ? "ml-3" : ""}>
          <Breadcrumb
            filePath={activeContext.filePath}
            hasUnsavedChanges={activeContext.isDirty}
          />
        </div>
      {/if}
    </div>
  </header>

  {#if !hidden && chatSession}
    {#if chatSession.sessionStatus === "external_terminated"}
      <div class="flex-1 overflow-hidden p-5">
        {#if chatSession.metadata?.external?.pty?.snapshot}
          <XtermSnapshot
            snapshot={chatSession.metadata.external.pty.snapshot}
          />
        {:else}
          <div
            class="text-muted border-border mt-4 rounded-md border border-dashed px-4 py-2 text-xs"
          >
            Session ended. Run a new command from another chat or draft to start
            a fresh PTY session.
          </div>
        {/if}
      </div>
    {:else if uiState.promptEditorOpen}
      <PromptEditor />
    {/if}
  {/if}

  <!-- Keep PTY stream pool mounted even when panel is hidden -->
  <div class:hidden class="h-full min-h-0 flex-1 p-5">
    <PtyStreamPool
      visibleSessionId={selectedPtyStream?.ptySessionId}
      onTerminalReady={handleXtermReady}
    />
  </div>
</section>
