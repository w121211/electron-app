<!-- src/renderer/src/components/NavigationButtonsNew.svelte -->
<script lang="ts">
  import { House, Search, Plus, Gear } from "svelte-bootstrap-icons";
  import { ui } from "../stores/ui.svelte.js";
  import { showToast, uiState } from "../stores/ui-store.svelte.js";
  import { resetQuickLauncher } from "../stores/quick-launcher-store.svelte.js";

  function handleGoHome(): void {
    window.location.reload();
  }

  function handleSearch(): void {
    resetQuickLauncher();
    uiState.quickLauncherOpen = true;
  }

  async function handleNewPrompt(): Promise<void> {
    try {
      await window.api.quickPromptWindow.show();
    } catch (error) {
      console.error("Failed to show quick prompt window:", error);
      showToast("Failed to open quick prompt", "error");
    }
  }

  function handleOpenSettings(): void {
    ui.settingsPanelOpen = true;
  }
</script>

<div class="flex items-center gap-3">
  <button
    onclick={handleGoHome}
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Home"
  >
    <House class="text-lg" />
  </button>
  <button
    onclick={handleSearch}
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Search"
  >
    <Search class="text-lg" />
  </button>
  <button
    onclick={handleNewPrompt}
    class="bg-surface text-muted hover:text-accent flex items-center gap-0.5 rounded-md px-2.5 py-1 text-sm font-medium"
  >
    <Plus />
    <span>Prompt</span>
  </button>
</div>
<div class="flex items-center">
  <button
    onclick={handleOpenSettings}
    class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
    title="Settings"
  >
    <Gear class="text-lg" />
  </button>
</div>
