<!-- src/renderer/src/components/app-v2/LightPromptCentricView.svelte -->
<script lang="ts">
  import { getSelectedInboxEntry } from "../../stores/inbox-store.svelte.js";
  import { isChatSession, isPrompt } from "../../services/inbox-service.js";
  import LightEntryList from "./LightEntryList.svelte";
  import LightPromptEditor from "./LightPromptEditor.svelte";
  import InboxEntryContextMenu from "./InboxEntryContextMenu.svelte";
  import LightChatSessionView from "./LightChatSessionView.svelte";

  const selectedEntry = $derived.by(getSelectedInboxEntry);

  const selectedPromptEntry = $derived.by(() => {
    if (selectedEntry && isPrompt(selectedEntry)) {
      return selectedEntry;
    }
    return null;
  });

  const selectedChatEntry = $derived.by(() => {
    if (selectedEntry && isChatSession(selectedEntry)) {
      return selectedEntry;
    }
    return null;
  });
</script>

<div class="flex h-screen w-screen">
  <LightEntryList />
  {#if selectedPromptEntry}
    <LightPromptEditor promptEntry={selectedPromptEntry} />
  {:else if selectedChatEntry}
    <LightChatSessionView entry={selectedChatEntry} />
  {:else}
    <div
      class="bg-background text-muted flex flex-1 flex-col items-center justify-center text-sm"
    >
      Select an entry or create a new one.
    </div>
  {/if}
  <InboxEntryContextMenu />
</div>
