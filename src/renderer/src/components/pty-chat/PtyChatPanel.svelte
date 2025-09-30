<!-- src/renderer/src/components/pty-chat/PtyChatPanel.svelte -->
<script lang="ts">
  import { chatState } from "../../stores/chat-store.svelte.js";
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

  const logger = new Logger({ name: "PtyChatPanel" }); // Initialize logger

  let {
    hidden = false,
  }: {
    hidden?: boolean;
  } = $props();

  let selectedPtyStream: PtyStream | null = $state(null);

  $effect(() => {
    const ptyInstanceId =
      chatState.currentChat?.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      selectedPtyStream = ptyStreamManager.getOrAttachStream(ptyInstanceId);
    } else {
      selectedPtyStream = null;
    }
  });

  $effect(() => {
    if (!hidden && chatState.currentChat?._type !== "pty_chat") {
      throw new Error(
        "PtyChatPanel requires a PTY chat session but current chat type is: " +
          chatState.currentChat?._type,
      );
    }
  });

  // Show prompt editor only for chat draft
  $effect(() => {
    uiState.promptEditorOpen = chatState.currentChat?._type === "chat_draft";
  });

  // Event handlers
  const handleXtermReady = (readyStream: PtyStream): void => {
    logger.info(`Terminal for session ${readyStream.ptySessionId} is ready.`);

    if (
      selectedPtyStream &&
      readyStream.ptySessionId === selectedPtyStream.ptySessionId
    ) {
      const initialCommand =
        chatState.currentChat?.metadata?.external?.pty?.initialCommand;

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

  $inspect(chatState.currentChat);
  $inspect(selectedPtyStream);

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

      {#if chatState.currentChat}
        <div class={!uiState.leftPanelOpen ? "ml-3" : ""}>
          <Breadcrumb
            filePath={chatState.currentChat.absoluteFilePath}
            hasUnsavedChanges={chatState.hasUnsavedDraftChanges}
          />
        </div>
      {/if}
    </div>
  </header>

  {#if !hidden && chatState.currentChat}
    {#if chatState.currentChat.sessionStatus === "external_terminated"}
      <div class="flex-1 overflow-hidden p-5">
        {#if chatState.currentChat.metadata?.external?.pty?.screenshot}
          <XtermSnapshot
            snapshot={chatState.currentChat.metadata.external.pty.screenshot}
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
