<!-- src/renderer/src/components/prompt-centric/FileMentionDropdown.svelte -->
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

  // Scroll selected item into view when selection changes
  $effect(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      const element = document.querySelector(
        `[data-dropdown-index="${selectedIndex}"]`,
      );
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
</script>

<div class={`z-50 ${className}`}>
  <div
    class="border-border max-h-60 overflow-y-auto rounded-md border shadow-lg"
  >
    {#if results.length === 0}
      <div class="text-muted px-2 py-1 text-sm">No files found</div>
    {:else}
      {#each results as result, index (index)}
        <button
          data-dropdown-index={index}
          class="hover:bg-hover focus:bg-hover w-full px-2 py-1 text-left focus:outline-none"
          class:bg-hover={selectedIndex === index}
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
