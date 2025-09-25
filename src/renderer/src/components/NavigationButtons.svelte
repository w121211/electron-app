<!-- src/renderer/src/components/NavigationButtons.svelte -->
<script lang="ts">
  import { House, Search, LayoutSidebar } from "svelte-bootstrap-icons";
  import { uiState, toggleLeftPanel } from "../stores/ui-store.svelte.js";
</script>

<!-- Show navigation buttons when left panel is closed -->
{#if !uiState.leftPanelOpen}
  <button
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Home"
  >
    <House class="text-base" />
  </button>
  <button
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Search"
  >
    <Search class="text-base" />
  </button>
  <button
    onclick={toggleLeftPanel}
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Toggle Sidebar"
  >
    <LayoutSidebar class="text-base" />
  </button>
{/if}