<!-- src/renderer/src/components/prompt-centric/LightVerticalNav.svelte -->
<script lang="ts">
  import {
    PencilSquare,
    ChatDots,
    Search,
    Folder,
    Gear,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import {
    uiV2State,
    openQuickLauncher,
    setCenterPanelView,
  } from "../../stores/ui-v2-store.svelte";
  import { rendererPromptService } from "../../services/renderer-prompt-service.js";
  import {
    getSelectedInboxEntry,
    refreshInboxEntries,
  } from "../../stores/inbox-store.svelte.js";
  import { isPrompt } from "../../services/inbox-service.js";

  const logger = new Logger({ name: "InboxVerticalNav" });

  // const selectedEntry = $derived.by(() => {
  //   const id = inboxState.selectedId;
  //   return inboxState.entries.find((entry) => getEntryId(entry) === id);
  // });

  const selectedInboxEntry = $derived.by(getSelectedInboxEntry);

  async function handleCreatePrompt(): Promise<void> {
    if (selectedInboxEntry && isPrompt(selectedInboxEntry)) {
      const trimmedContent = selectedInboxEntry.content.trim();
      if (!trimmedContent) {
        logger.warn("Cannot create new prompt while current prompt is empty");
        return;
      }
    }

    try {
      const newPrompt = await rendererPromptService.createPrompt({
        content: "",
      });
      await refreshInboxEntries({ selectId: newPrompt.id });
    } catch (error) {
      logger.error("Failed to create prompt", error);
    }
  }
</script>

<nav class="bg-surface flex w-10 flex-col items-center gap-3 px-1 py-2">
  <div class="text-muted flex flex-1 flex-col items-center gap-3 text-base">
    <button
      class="hover:bg-hover hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
      title="New Prompt"
      onclick={handleCreatePrompt}
    >
      <PencilSquare />
    </button>
    <button
      class="hover:bg-hover hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
      class:text-accent={uiV2State.centerPanelView === "inbox"}
      title="Inbox"
      onclick={() => setCenterPanelView("inbox")}
    >
      <ChatDots />
    </button>
    <button
      class="hover:bg-hover hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
      title="Search"
      onclick={openQuickLauncher}
    >
      <Search />
    </button>
    <!-- <button
      class="hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      title="Projects"
    >
      <Folder />
    </button> -->
  </div>
  <button
    class="hover:bg-hover hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
    class:text-accent={uiV2State.centerPanelView === "settings"}
    onclick={() => setCenterPanelView("settings")}
    title="Settings"
  >
    <Gear />
  </button>
</nav>
