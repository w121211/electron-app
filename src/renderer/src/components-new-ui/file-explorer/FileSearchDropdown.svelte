<!-- src/renderer/src/components/file-explorer/FileSearchDropdown.svelte -->
<script lang="ts">
  import type { FileSearchResult } from "../../../../core/services/project-folder-service.js";

  interface Props {
    results: FileSearchResult[];
    selectedIndex: number;
    visible: boolean;
    loading?: boolean;
    class?: string;
    onselect: (result: FileSearchResult) => void;
    oncancel: () => void;
    onhover: (index: number) => void;
  }

  let {
    results,
    selectedIndex,
    visible,
    loading = false,
    class: className = "",
    onselect,
    oncancel,
    onhover,
  }: Props = $props();

  function handleSelect(result: FileSearchResult): void {
    onselect(result);
  }

  function handleCancel(): void {
    oncancel();
  }

  // Handle mouse enter to update selected index
  function handleMouseEnter(index: number): void {
    onhover(index);
  }
</script>

{#if visible}
  <div class={`z-50 ${className}`}>
    <div
      class="bg-panel border-border max-h-60 overflow-y-auto rounded-md border shadow-lg"
    >
      {#if loading}
        <div class="text-muted px-3 py-2 text-sm">
          <div class="flex items-center gap-2">
            <div
              class="border-accent h-3 w-3 animate-spin rounded-full border border-t-transparent"
            ></div>
            Searching files...
          </div>
        </div>
      {:else if results.length === 0}
        <div class="text-muted px-3 py-2 text-sm">No files found</div>
      {:else}
        {#each results as result, index (result.absolutePath)}
          <button
            class="hover:bg-hover focus:bg-hover w-full px-3 py-2 text-left focus:outline-none {selectedIndex ===
            index
              ? 'bg-hover'
              : ''}"
            onclick={() => handleSelect(result)}
            onmouseenter={() => handleMouseEnter(index)}
          >
            <div class="flex flex-col">
              <div class="text-foreground text-sm font-medium">
                {#if result.highlightTokens}
                  {#each result.highlightTokens as token, index (index)}
                    {#if token.isHighlighted}
                      <mark>{token.text}</mark>
                    {:else}
                      {token.text}
                    {/if}
                  {/each}
                {:else}
                  {result.name}
                {/if}
              </div>
              {#if result.relativePath !== result.name}
                <div class="text-muted text-xs">
                  {result.relativePath}
                </div>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}
