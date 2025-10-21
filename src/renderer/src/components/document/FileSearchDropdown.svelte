<!-- src/renderer/src/components/chat/FileSearchDropdown.svelte -->
<script lang="ts">
  import type { ProjectFileSearchResult } from "../../../../core/services/project-folder-service.js";

  interface Props {
    results: ProjectFileSearchResult[];
    selectedIndex: number;
    class?: string;
    onselect: (result: ProjectFileSearchResult) => void;
    oncancel: () => void;
    onhover: (index: number) => void;
  }

  let {
    results,
    selectedIndex,
    class: className = "",
    onselect,
    oncancel,
    onhover,
  }: Props = $props();

  function handleSelect(result: ProjectFileSearchResult): void {
    onselect(result);
  }

  // @ts-expect-error - Intentionally unused for future use
  function handleCancel(): void {
    oncancel();
  }

  // Handle mouse enter to update selected index
  function handleMouseEnter(index: number): void {
    onhover(index);
  }
</script>

<div class={`z-50 ${className}`}>
  <div
    class="bg-background border-border max-h-60 overflow-y-auto rounded-md border shadow-lg"
  >
    <!-- {#if loading}
      <div class="text-muted px-3 py-2 text-sm">
        <div class="flex items-center gap-2">
          <div
            class="border-accent h-3 w-3 animate-spin rounded-full border border-t-transparent"
          ></div>
          Searching files...
        </div>
      </div> -->
    <!-- {:else  -->
    {#if results.length === 0}
      <div class="text-muted px-3 py-2 text-sm">No files found</div>
    {:else}
      {#each results as result, index (index)}
        <button
          class="hover:bg-hover focus:bg-hover w-full px-3 py-2 text-left focus:outline-none {selectedIndex ===
          index
            ? 'bg-hover'
            : ''}"
          onclick={() => handleSelect(result)}
          onmouseenter={() => handleMouseEnter(index)}
        >
          <div class="truncate text-sm">
            <span class="text-foreground">
              {#if result.highlightTokens.length > 0}
                {#each result.highlightTokens as token, index (index)}
                  {#if token.isHighlighted}
                    <mark class="text-accent bg-transparent underline"
                      >{token.text}</mark
                    >
                  {:else}
                    {token.text}
                  {/if}
                {/each}
              {:else}
                {result.relativePath}
              {/if}
            </span>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>
