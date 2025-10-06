<!-- src/renderer/src/components/XtermPanel.svelte -->
<script lang="ts">
  import { chatState } from "../stores/chat-store.svelte.js";
  import Xterm from "./Xterm.svelte";
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
    <Xterm />
  </div>
</section>
