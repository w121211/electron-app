<!-- src/renderer/src/components/prompt-centric/InboxVerticalNav.svelte -->
<script lang="ts">
  import {
    Stars,
    PencilSquare,
    Search,
    Folder,
    Gear,
  } from "svelte-bootstrap-icons";
  import {
    uiV2State,
    openQuickLauncher,
    setCenterPanelView,
  } from "../../stores/ui-v2-store.svelte";
  import { Logger } from "tslog";
  import { rendererPromptService } from "../../services/renderer-prompt-service.js";
  import {
    inboxState,
    setInboxEntries,
    setInboxLoading,
    selectInboxEntry,
  } from "../../stores/inbox-store.svelte.js";
  import {
    fetchInboxEntries,
    isPrompt,
    getEntryId,
  } from "../../services/inbox-service.js";

  const logger = new Logger({ name: "InboxVerticalNav" });

  const selectedEntry = $derived.by(() => {
    const id = inboxState.selectedId;
    return inboxState.entries.find((entry) => getEntryId(entry) === id);
  });

  async function handleCreatePrompt(): Promise<void> {
    if (selectedEntry && isPrompt(selectedEntry)) {
      const trimmedContent = selectedEntry.content.trim();
      if (!trimmedContent) {
        logger.warn("Cannot create new prompt while current prompt is empty");
        return;
      }
    }

    try {
      const newPrompt = await rendererPromptService.createPrompt({
        content: "",
      });
      await refreshEntries(newPrompt.id);
    } catch (error) {
      logger.error("Failed to create prompt", error);
    }
  }

  async function refreshEntries(selectId?: string): Promise<void> {
    setInboxLoading(true);
    try {
      const results = await fetchInboxEntries();
      setInboxEntries(results);

      if (selectId) {
        selectInboxEntry(selectId);
      }
    } catch (error) {
      logger.error("Failed to load inbox entries", error);
    } finally {
      setInboxLoading(false);
    }
  }
</script>

<nav class="bg-surface flex w-10 flex-col items-center gap-3 px-1 py-2">
  <div class="text-muted flex flex-1 flex-col items-center gap-3 text-base">
    <button
      class="text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      title="New Prompt"
      onclick={() => void handleCreatePrompt()}
    >
      <PencilSquare />
    </button>
    <button
      class={uiV2State.centerPanelView === "settings"
        ? "text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
        : "bg-surface text-foreground flex h-8 w-8 items-center justify-center rounded-lg"}
      title="Prompts"
      onclick={() => setCenterPanelView("inbox")}
    >
      <Stars
        class={uiV2State.centerPanelView === "settings" ? "" : "text-accent"}
      />
    </button>
    <button
      class="text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      title="Search"
      onclick={openQuickLauncher}
    >
      <Search />
    </button>
    <button
      class="text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      title="Projects"
    >
      <Folder />
    </button>
  </div>

  <button
    class={uiV2State.centerPanelView === "settings"
      ? "bg-surface text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      : "text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"}
    title="Settings"
    onclick={() => setCenterPanelView("settings")}
  >
    <Gear
      class={uiV2State.centerPanelView === "settings" ? "text-accent" : ""}
    />
  </button>
</nav>
