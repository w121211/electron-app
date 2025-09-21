<!-- src/renderer/src/components/AiGenerationDisplay.svelte -->
<script lang="ts">
  import type { ChatSessionData } from "../../../../core/services/chat-engine/chat-session-repository.js";

  interface Props {
    chatSession: ChatSessionData;
  }

  let { chatSession }: Props = $props();

  // Determine generation stage based on chat session state
  const generationStage = $derived(() => {
    if (chatSession.sessionStatus !== "processing") {
      return null;
    }

    // Check if there are any messages being generated
    // For now, we'll show a simple processing state
    // In the future, this could be enhanced with streaming content from events
    return "processing";
  });

  const isProcessing = $derived(() => generationStage() !== null);
</script>

{#if isProcessing()}
  <div class="group flex flex-col items-start">
    <div class="mb-0.5 flex items-center gap-2">
      <span
        class="bg-accent flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
      >
        C
      </span>
      <span class="text-muted text-xs font-medium">Claude Sonnet 4</span>
      <span class="text-muted text-xs">
        {#if generationStage() === "processing"}
          Processing...
        {/if}
      </span>
    </div>

    <div class="text-foreground pl-7 leading-normal">
      <!-- Processing stage -->
      <div class="flex items-center gap-2">
        <div class="text-muted animate-pulse">Thinking...</div>
        <div class="flex space-x-1">
          <div class="bg-muted h-1 w-1 animate-pulse rounded-full"></div>
          <div
            class="bg-muted h-1 w-1 animate-pulse rounded-full delay-75"
          ></div>
          <div
            class="bg-muted h-1 w-1 animate-pulse rounded-full delay-150"
          ></div>
        </div>
      </div>
    </div>
  </div>
{/if}
