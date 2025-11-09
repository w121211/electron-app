<!-- src/renderer/src/components/app-v2/LightPromptCentricView.svelte -->
<script lang="ts">
  import { getSelectedInboxEntry } from "../../stores/inbox-store.svelte.js";
  import { isChatSession } from "../../services/inbox-service.js";
  import LightEntryList from "./LightEntryList.svelte";
  import LightPromptEditor from "./LightPromptEditor.svelte";
  import InboxEntryContextMenu from "./InboxEntryContextMenu.svelte";
  import LightChatSessionView from "./LightChatSessionView.svelte";

  const selectedEntry = $derived.by(getSelectedInboxEntry);
  const selectedChatEntry = $derived.by(() => {
    if (!selectedEntry || !isChatSession(selectedEntry)) {
      return null;
    }
    return selectedEntry;
  });
</script>

<div class="flex h-screen w-screen">
  <LightEntryList />
  {#if selectedChatEntry}
    <LightChatSessionView entry={selectedChatEntry} />
  {:else}
    <LightPromptEditor entry={selectedEntry} />
  {/if}
  <InboxEntryContextMenu />
</div>
