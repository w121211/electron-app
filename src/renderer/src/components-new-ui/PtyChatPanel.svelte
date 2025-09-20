<!-- src/renderer/src/components-new-ui/PtyChatPanel.svelte -->
<script lang="ts">
  import { chatState } from "../stores/chat-store.svelte.js";
  import PtyChat from "./PtyChat.svelte";
  import Breadcrumb from "./Breadcrumb.svelte";
</script>

<section class="bg-background relative flex min-w-0 flex-1 flex-col">
  <!-- Header with Breadcrumb -->
  <header class="border-border flex h-12 flex-shrink-0 items-center gap-2 px-4">
    {#if chatState.currentChat}
      <Breadcrumb filePath={chatState.currentChat.absoluteFilePath} />
    {/if}
  </header>

  <!-- Terminal Content -->
  <div class="flex-1 overflow-y-auto p-5">
    {#if chatState.currentChat}
      <PtyChat chat={chatState.currentChat} />
    {/if}
  </div>
</section>
