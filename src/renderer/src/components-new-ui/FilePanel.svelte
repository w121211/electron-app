<!-- src/renderer/src/components-new-ui/FilePanel.svelte -->
<script lang="ts">
  import { ChevronRight, Pencil } from "svelte-bootstrap-icons";
  import { filePanelState } from "../stores/file-panel-store.svelte.js";
  import { projectState } from "../stores/project-store.svelte.js";
  import { showToast } from "../stores/ui-store.svelte.js";
  import MarkdownRenderer from "./MarkdownRenderer.svelte";

  const breadcrumb = $derived(() => {
    if (!filePanelState.filePath) return null;

    const pathParts = filePanelState.filePath.split("/");
    const fileName = pathParts.pop();

    const containingProject = projectState.projectFolders.find((project) =>
      filePanelState.filePath!.startsWith(project.path),
    );

    const projectName = containingProject
      ? containingProject.name
      : pathParts.slice(-2, -1)[0] || "Unknown";

    return {
      projectName,
      fileName,
    };
  });

  function handleEdit(): void {
    showToast("Edit functionality is not yet implemented.", "info");
  }
</script>

<section class="relative flex min-w-0 flex-1 flex-col">
  <!-- Header with Breadcrumb -->
  <header class="flex h-10 flex-shrink-0 items-center px-4">
    {#if breadcrumb()}
      <div class="flex items-center gap-1">
        <span class="text-muted text-xs">{breadcrumb()?.projectName}</span>
        <ChevronRight class="text-muted text-xs" />
        <span class="text-muted text-xs">{breadcrumb()?.fileName}</span>
      </div>
    {/if}
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
        {:else if filePanelState.content}
          <MarkdownRenderer content={filePanelState.content} />
        {:else}
          <div class="flex h-full items-center justify-center">
            <p class="text-muted">No file content.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
>
