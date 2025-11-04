<!-- src/renderer/src/components/prompt-centric/LightPromptCentricView.svelte -->
<script lang="ts">
  import { getSelectedInboxEntry } from "../../stores/inbox-store.svelte.js";
  import LightEntryList from "./LightEntryList.svelte";
  import LightPromptEditor from "./LightPromptEditor.svelte";
  import InboxEntryContextMenu from "./InboxEntryContextMenu.svelte";

  const selectedEntry = $derived.by(getSelectedInboxEntry);
</script>

<div class="flex h-screen w-screen">
  <LightEntryList />
  <LightPromptEditor entry={selectedEntry} />
  <InboxEntryContextMenu />
</div>
