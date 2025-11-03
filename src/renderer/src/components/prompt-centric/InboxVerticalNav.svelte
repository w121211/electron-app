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
    inboxUiState,
    openQuickLauncher,
    openSettings,
    closeSettings,
  } from "../../stores/inbox-ui-store.svelte.js";
  import { Logger } from "tslog";
  import { promptClientService } from "../../services/prompt-client-service.js";
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
      const newPrompt = await promptClientService.createPrompt({
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

<nav class="flex w-10 flex-col items-center gap-3 py-2 pl-1">
  <div class="text-muted flex flex-1 flex-col items-center gap-3 text-base">
    <button
      class="text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      title="New Prompt"
      onclick={() => void handleCreatePrompt()}
    >
      <PencilSquare />
    </button>
    <button
      class={inboxUiState.settingsPanelOpen
        ? "text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
        : "bg-border text-foreground flex h-8 w-8 items-center justify-center rounded-lg"}
      title="Prompts"
      onclick={closeSettings}
    >
      <Stars class={inboxUiState.settingsPanelOpen ? "" : "text-accent"} />
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
    class={inboxUiState.settingsPanelOpen
      ? "bg-border text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
      : "text-muted hover:bg-hover hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"}
    title="Settings"
    onclick={openSettings}
  >
    <Gear class={inboxUiState.settingsPanelOpen ? "text-accent" : ""} />
  </button>
</nav>
