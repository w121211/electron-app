<!-- src/renderer/src/components/pty-chat/PtyChatPanel.svelte -->
<script lang="ts">
  import { chatState } from "../../stores/chat-store.svelte.js";
  import { uiState } from "../../stores/ui-store.svelte.js";
  import PtyChat from "./PtyChat.svelte";
  import Breadcrumb from "../Breadcrumb.svelte";
  import PromptEditor from "../chat/PromptEditor.svelte";

  // Session status-based display logic
  const shouldShowPromptEditor = $derived.by(() => {
    if (!chatState.currentChat) {
      return false;
    }

    const sessionStatus = chatState.currentChat.sessionStatus;

    // Show prompt editor only when session is idle
    return sessionStatus === "idle";
  });

  // Auto-update prompt editor based on session status
  $effect(() => {
    uiState.promptEditorOpen = shouldShowPromptEditor;
  });
</script>

<section
  class="relative flex min-w-0 flex-1 flex-col"
  class:bg-surface={uiState.promptEditorOpen}
>
  <!-- Header with Breadcrumb -->
  <header class="flex h-12 items-center justify-between px-4">
    <div class="flex items-center gap-1">
      {#if chatState.currentChat}
        <Breadcrumb filePath={chatState.currentChat.absoluteFilePath} />
      {/if}
    </div>
    <!-- <div class="flex items-center">
      <button
        onclick={chatService.togglePromptEditor}
        title="Prompt Editor"
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
      >
        <PencilSquare />
      </button>
    </div> -->
  </header>

  <!-- Content based on session status -->
  {#if chatState.currentChat}
    {#if chatState.currentChat.sessionStatus === "idle"}
      <PromptEditor />
    {:else if chatState.currentChat.sessionStatus === "external_active"}
      <!-- Terminal Content -->
      <div class="flex-1 overflow-y-auto p-5">
        <PtyChat chat={chatState.currentChat} />
      </div>
    {:else if chatState.currentChat.sessionStatus === "external_terminated"}
      <!-- Terminated Session Message -->
      <div class="flex-1 overflow-y-auto p-5">
        <!-- <PtyChat chat={chatState.currentChat} /> -->
        <div
          class="text-muted border-border mt-4 rounded-md border border-dashed px-4 py-2 text-xs"
        >
          Session ended. Run a new command from another chat or draft to start a
          fresh PTY session.
        </div>
      </div>
    {:else}
      <!-- Fallback for other statuses -->
      <div class="flex-1 overflow-y-auto p-5">
        <PtyChat chat={chatState.currentChat} />
      </div>
    {/if}
  {/if}
</section>
