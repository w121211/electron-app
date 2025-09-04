<!-- src/renderer/src/components-new-ui/RightPanel.svelte -->
<script lang="ts">
  import { Pencil, Download, XLg, FileEarmark } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { showToast, uiState } from "../stores/ui-store.svelte.js";
  import { treeState } from "../stores/tree-store.svelte.js";
  import { fileService } from "../services/file-service.js";
  import { projectService } from "../services/project-service.js";

  const logger = new Logger({ name: "NewRightPanel" });

  // Derived loading state
  const isLoadingOpenFile = $derived(
    uiState.loadingStates["openFile"] || false,
  );

  // Context management state
  let projectContext = $state(`@<demo-project>/demo.md
@/path/to/outside/file.md
Text is also allowed`);
  let isEditingContext = $state(false);
  let contextInput = $state("");

  // Preview state
  let fileContent = $state<any>(null);
  let fileLoadError = $state<string | null>(null);

  // Mock artifacts
  const mockArtifacts = [
    {
      id: "1",
      fileName: "wireframe.html",
      version: "v3",
      type: "html",
    },
  ];

  // Load file content when preview file changes using $effect
  $effect(() => {
    if (treeState.selectedPreviewFile) {
      loadFileContent(treeState.selectedPreviewFile);
    }
  });

  async function loadFileContent(filePath: string): Promise<void> {
    fileContent = null;
    fileLoadError = null;

    try {
      logger.info("Loading file content:", filePath);
      fileContent = await fileService.openFile(filePath);
    } catch (error) {
      logger.error("Failed to load file content:", error);
      fileLoadError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  function handleEditContext(): void {
    contextInput = projectContext;
    isEditingContext = true;
  }

  function handleSaveContext(): void {
    projectContext = contextInput;
    isEditingContext = false;
    showToast("Project context updated", "success");
  }

  function handleCancelEdit(): void {
    contextInput = projectContext;
    isEditingContext = false;
  }

  function handleDownloadArtifact(fileName: string): void {
    showToast(`Download ${fileName} functionality coming soon`, "info");
  }

  function handlePreviewFile(filePath: string): void {
    showToast(`Preview ${filePath} functionality coming soon`, "info");
  }

  function handleDownload(): void {
    showToast("Download functionality coming soon", "info");
  }

  function handleRefresh(): void {
    if (treeState.selectedPreviewFile) {
      loadFileContent(treeState.selectedPreviewFile);
    }
  }

  function clearPreview(): void {
    projectService.clearSelection();
    fileContent = null;
    fileLoadError = null;
  }

  function renderContextContent(text: string): Array<{
    type: string;
    content: string;
    key: number;
  }> {
    const parts = text.split(/(@[^\s]+)/g);

    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        return {
          type: "file",
          content: part,
          key: index,
        };
      }
      return {
        type: "text",
        content: part,
        key: index,
      };
    });
  }

  function formatFileSize(content: string, isBase64: boolean = false): string {
    const bytes = isBase64 ? content.length : new Blob([content]).size;
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
</script>

<!-- Right Panel -->
<aside class="bg-surface border-border relative flex w-96 flex-col border-l">
  <!-- Preview Overlay -->
  {#if treeState.selectedPreviewFile}
    <div class="bg-surface absolute inset-0 z-20" id="preview-panel">
      <div class="flex h-12 items-center justify-between px-4">
        <div class="flex items-center">
          <span class="font-medium" id="preview-title">
            {treeState.selectedPreviewFile?.split("/").pop()}
          </span>
          <span class="text-muted ml-2 text-xs">Preview</span>
        </div>
        <div class="flex items-center space-x-3">
          <button
            onclick={handleDownload}
            class="text-muted hover:text-accent cursor-pointer"
          >
            <Download class="text-base" />
          </button>
          <button
            onclick={clearPreview}
            class="text-muted hover:text-accent cursor-pointer"
          >
            <XLg class="text-base" />
          </button>
        </div>
      </div>
      <div
        class="scrollbar-thin flex-1 overflow-y-auto p-4"
        id="preview-content"
      >
        {#if isLoadingOpenFile}
          <div class="flex flex-1 items-center justify-center">
            <div class="text-muted">Loading file...</div>
          </div>
        {:else if fileLoadError}
          <div class="flex flex-1 items-center justify-center">
            <div class="text-center text-red-400">
              <FileEarmark class="mx-auto mb-4 text-5xl" />
              <p class="mb-2">Failed to load file</p>
              <p class="text-muted mb-3 text-sm">
                {treeState.selectedPreviewFile?.split("/").pop()}
              </p>
              <p class="mb-3 text-sm text-red-400">{fileLoadError}</p>
            </div>
          </div>
        {:else if fileContent}
          <div class="prose prose-invert max-w-none">
            {#if fileContent.isBase64}
              <div class="text-muted text-center">
                <div class="mb-2">Binary file preview not supported</div>
                <div class="text-sm">
                  File type: {fileContent.fileType}
                  <br />
                  Size: {formatFileSize(fileContent.content, true)}
                </div>
              </div>
            {:else}
              <h1 class="text-foreground mb-4 text-xl font-bold">
                {treeState.selectedPreviewFile?.split("/").pop()}
              </h1>
              <p class="text-foreground mb-4">
                This is a file preview. Actual file content would be loaded
                here.
              </p>
              <ul class="text-foreground list-disc pl-5">
                <li>Dynamic content loading</li>
                <li>Syntax highlighting</li>
                <li>Live preview updates</li>
              </ul>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chat Control Base Layer -->
  <div class="flex h-full flex-col">
    <!-- Panel Header -->
    <div class="flex h-12 items-center justify-between px-4">
      <span class="text-muted text-xs font-semibold tracking-wide uppercase"
        >Chat Control</span
      >
      <button
        onclick={() => (uiState.rightPanelOpen = false)}
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
        title="Close Panel"
      >
        <XLg class="text-base" />
      </button>
    </div>
    <div class="scrollbar-thin flex-1 overflow-y-auto">
      <div class="px-3">
        <!-- Project Context Header -->
        <div
          class="hover:bg-hover text-muted group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1"
          title="Project Context"
        >
          <span class="text-sm font-medium">Project Context</span>
          <button
            onclick={handleEditContext}
            class="text-muted hover:text-accent ml-auto cursor-pointer opacity-0 group-hover:opacity-100"
            title="Edit"
          >
            <Pencil class="text-xs" />
          </button>
        </div>

        <!-- Context content -->
        <div class="px-2 pb-1">
          {#if !isEditingContext}
            <div
              class="bg-input-background border-input-border text-muted min-h-[100px] rounded-md border p-3 text-sm"
            >
              {#each renderContextContent(projectContext) as part (part.key)}
                {#if part.type === "file"}
                  <button
                    onclick={() => handlePreviewFile(part.content)}
                    class="text-accent hover:text-accent/80 mr-2 cursor-pointer underline"
                  >
                    {part.content}
                  </button>
                {:else}
                  <span>{part.content}</span>
                {/if}
              {/each}
            </div>
          {:else}
            <textarea
              bind:value={contextInput}
              rows="4"
              class="text-foreground bg-input-background border-input-border focus:border-accent placeholder-muted w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none"
              placeholder="@<demo-project>/demo.md&#10;@/path/to/outside/file.md&#10;Text is also allowed"
            ></textarea>
            <div class="mt-2 flex items-center gap-2">
              <button
                onclick={handleSaveContext}
                class="bg-accent rounded px-3 py-1 text-xs text-white"
              >
                Save
              </button>
              <button
                onclick={handleCancelEdit}
                class="text-muted hover:text-foreground rounded px-3 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          {/if}
        </div>

        <!-- Artifacts Header -->
        <div
          class="hover:bg-hover text-muted group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1"
          title="Artifacts"
        >
          <span class="text-sm font-medium">Artifacts</span>
          <button
            class="text-muted hover:text-accent ml-auto cursor-pointer opacity-0 group-hover:opacity-100"
            title="Download All"
          >
            <Download class="text-xs" />
          </button>
        </div>

        <!-- Artifacts content -->
        <div class="px-2">
          {#each mockArtifacts as artifact (artifact.id)}
            <div
              class="hover:bg-hover group relative flex min-h-[24px] cursor-pointer items-center rounded px-1 py-0.5 text-sm font-[400] transition-colors"
              role="button"
              tabindex="0"
              onclick={() => handlePreviewFile(artifact.fileName)}
              onkeydown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                handlePreviewFile(artifact.fileName)}
            >
              <FileEarmark class="text-muted mr-1.5 text-xs" />
              <span class="text-xs">{artifact.fileName}</span>
              <span class="text-muted ml-1 text-xs">{artifact.version}</span>
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  handleDownloadArtifact(artifact.fileName);
                }}
                class="text-muted hover:text-accent ml-auto cursor-pointer p-0.5 opacity-0 group-hover:opacity-100"
                title="Download"
              >
                <Download class="text-xs" />
              </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</aside>

<style>
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #2c2c2e;
    border-radius: 3px;
  }
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
