<!-- src/renderer/src/components/FilePanel.svelte -->
<script lang="ts">
  import { Pencil } from "svelte-bootstrap-icons";
  import { filePanelState } from "../stores/file-panel-store.svelte.js";
  import { uiState, showToast } from "../stores/ui-store.svelte.js";
  import MarkdownTodoRenderer from "./MarkdownTodoRenderer.svelte";
  import Breadcrumb from "./Breadcrumb.svelte";
  import NavigationButtons from "./NavigationButtons.svelte";

  function handleEdit(): void {
    showToast("Edit functionality is not yet implemented.", "info");
  }
</script>

<section class="relative flex min-w-0 flex-1 flex-col">
  <!-- Header with Breadcrumb -->
  <header class="flex h-12 items-center justify-between px-4">
    <div class="flex items-center gap-1">
      <NavigationButtons />

      {#if filePanelState.filePath}
        <div class={!uiState.leftPanelOpen ? "ml-3" : ""}>
          <Breadcrumb filePath={filePanelState.filePath} />
        </div>
      {/if}
    </div>
  </header>

  <!-- File Viewer -->
  <div class="flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-6 py-3">
      <!-- File Toolbar -->
      <div class="flex h-12 flex-shrink-0 items-center justify-end px-4">
        <div class="flex items-center gap-2">
          <button
            onclick={handleEdit}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Edit File"
          >
            <Pencil />
          </button>
        </div>
      </div>

      <!-- File Content -->
      <div class="text-foreground w-full p-4 font-sans text-[13px] leading-6">
        {#if filePanelState.isLoading}
          <div class="flex h-full items-center justify-center">
            <p class="text-muted">Loading file...</p>
          </div>
        {:else if filePanelState.error}
          <div class="flex h-full items-center justify-center">
            <p class="text-red-400">
              Error loading file: {filePanelState.error}
            </p>
          </div>
        {:else if filePanelState.content && filePanelState.projectPath}
          <MarkdownTodoRenderer
            content={filePanelState.content}
            projectPath={filePanelState.projectPath}
          />
        {:else}
          <div class="flex h-full items-center justify-center">
            <p class="text-muted">No file content or project path missing.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
