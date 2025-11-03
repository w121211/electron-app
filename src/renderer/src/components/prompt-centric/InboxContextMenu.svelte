<!-- src/renderer/src/components/prompt-centric/InboxContextMenu.svelte -->
<script lang="ts">
  import { Trash } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import {
    inboxState,
    hideInboxContextMenu,
    removeInboxEntry,
  } from "../../stores/inbox-store.svelte.js";
  import { promptClientService } from "../../services/prompt-client-service.js";

  const logger = new Logger({ name: "InboxContextMenu" });

  const contextMenu = $derived(inboxState.contextMenu);

  async function handleDelete(): Promise<void> {
    const targetId = contextMenu.targetEntryId;
    if (!targetId || !contextMenu.isPrompt) {
      return;
    }

    try {
      await promptClientService.deletePrompt(targetId);
      removeInboxEntry(targetId);
      hideInboxContextMenu();
    } catch (error) {
      logger.error("Failed to delete prompt", error);
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest(".inbox-context-menu")) {
      hideInboxContextMenu();
    }
  }

  $effect(() => {
    if (contextMenu.isVisible) {
      document.addEventListener("click", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }
    return;
  });
</script>

{#if contextMenu.isVisible}
  <div
    class="inbox-context-menu bg-surface border-border fixed z-50 rounded-lg border shadow-lg"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
  >
    <div class="flex flex-col py-1">
      {#if contextMenu.isPrompt}
        <button
          class="text-foreground hover:bg-hover flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
          onclick={() => void handleDelete()}
        >
          <Trash class="text-base" />
          <span>Delete</span>
        </button>
      {:else}
        <div class="text-muted px-3 py-2 text-xs">
          Cannot delete active chat sessions
        </div>
      {/if}
    </div>
  </div>
{/if}
