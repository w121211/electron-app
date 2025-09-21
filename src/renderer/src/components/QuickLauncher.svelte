<!-- src/renderer/src/components/QuickLauncher.svelte -->
<script lang="ts">
  import { Search, Hash, FileText } from "svelte-bootstrap-icons";
  import { quickLauncherService } from "../services/quick-launcher-service.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import {
    quickLauncherState,
    resetQuickLauncher,
    setSearchQuery,
    moveSelectionUp,
    moveSelectionDown,
    setSelectedIndex,
    getSelectedResult,
    getFilteredResults,
    type ChatSearchResult,
  } from "../stores/quick-launcher-store.svelte.js";
  import type { ProjectFileSearchResult } from "../../../core/services/project-folder-service.js";

  let searchInput = $state<HTMLInputElement | null>(null);

  // Focus search input when launcher opens
  $effect(() => {
    if (uiState.quickLauncherOpen && searchInput) {
      searchInput.focus();
    }
  });

  // Load recent chats when launcher opens
  $effect(() => {
    if (uiState.quickLauncherOpen) {
      quickLauncherService.loadRecentChats();
    }
  });

  // Perform search when query changes
  $effect(() => {
    if (uiState.quickLauncherOpen) {
      quickLauncherService.performSearch(quickLauncherState.searchQuery);
    }
  });

  function handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        uiState.quickLauncherOpen = false;
        resetQuickLauncher();
        break;
      case "ArrowUp":
        event.preventDefault();
        moveSelectionUp();
        break;
      case "ArrowDown":
        event.preventDefault();
        moveSelectionDown();
        break;
      case "Enter":
        event.preventDefault();
        handleSelectResult();
        break;
    }
  }

  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    setSearchQuery(target.value);
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      uiState.quickLauncherOpen = false;
      resetQuickLauncher();
    }
  }

  function handleMouseEnter(index: number): void {
    setSelectedIndex(index);
  }

  async function handleSelectResult(): Promise<void> {
    const selectedResult = getSelectedResult();
    if (selectedResult) {
      try {
        await quickLauncherService.selectResult(selectedResult);
        uiState.quickLauncherOpen = false;
        resetQuickLauncher();
      } catch (error) {
        console.error("Failed to select result:", error);
      }
    }
  }

  function getResultIcon(type: "chat" | "file"): typeof Hash | typeof FileText {
    return type === "chat" ? Hash : FileText;
  }

  function formatResultPath(
    result: ChatSearchResult | ProjectFileSearchResult,
  ): string {
    return result.relativePath;
  }

  function getResultTitle(
    result: ChatSearchResult | ProjectFileSearchResult,
  ): string {
    if ("title" in result) {
      return result.title;
    }
    // For files, use the filename as title
    const parts = result.relativePath.split("/");
    return parts[parts.length - 1] || result.relativePath;
  }
</script>

{#if uiState.quickLauncherOpen}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Quick Launcher"
  >
    <div
      class="bg-background border-border mt-32 w-full max-w-2xl rounded-lg border"
    >
      <!-- Search Input -->
      <div class="border-border flex items-center border-b px-4 py-3">
        <Search class="text-muted mr-3 text-base" />
        <input
          bind:this={searchInput}
          type="text"
          placeholder={quickLauncherState.searchQuery === ""
            ? "Search files or recent chats..."
            : "Searching..."}
          class="text-foreground placeholder:text-muted w-full bg-transparent text-sm outline-none"
          value={quickLauncherState.searchQuery}
          oninput={handleSearchInput}
        />
      </div>

      <!-- Results -->
      <div class="max-h-96 overflow-y-auto">
        {#if quickLauncherState.isLoading}
          <div class="text-muted flex items-center justify-center py-8 text-sm">
            <div
              class="border-accent mr-2 h-4 w-4 animate-spin rounded-full border border-t-transparent"
            ></div>
            Searching...
          </div>
        {:else if getFilteredResults().length === 0}
          <div class="text-muted py-8 text-center text-sm">
            {quickLauncherState.searchQuery === ""
              ? "No recent chats found"
              : "No results found"}
          </div>
        {:else}
          <div class="py-2">
            {#if quickLauncherState.searchQuery === ""}
              <div
                class="text-muted px-4 py-2 text-xs font-medium tracking-wide uppercase"
              >
                Recent Chats
              </div>
            {/if}

            {#each getFilteredResults() as result, index (index)}
              {@const isSelected = quickLauncherState.selectedIndex === index}
              {@const Icon = getResultIcon(result.type)}
              {@const resultData = result.data}
              {@const title = getResultTitle(resultData)}
              {@const path = formatResultPath(resultData)}

              <button
                class="hover:bg-hover focus:bg-hover w-full px-4 py-2 text-left focus:outline-none {isSelected
                  ? 'bg-hover'
                  : ''}"
                onclick={handleSelectResult}
                onmouseenter={() => handleMouseEnter(index)}
              >
                <div class="flex items-center gap-3">
                  <Icon class="text-muted flex-shrink-0 text-sm" />
                  <div class="min-w-0 flex-1">
                    <div class="text-foreground truncate text-sm font-medium">
                      {title}
                    </div>
                    <div class="text-muted truncate text-xs">
                      {#if resultData.highlightTokens && resultData.highlightTokens.length > 0}
                        {#each resultData.highlightTokens as token, tokenIndex (tokenIndex)}
                          {#if token.isHighlighted}
                            <mark class="text-accent bg-transparent underline"
                              >{token.text}</mark
                            >
                          {:else}
                            {token.text}
                          {/if}
                        {/each}
                      {:else}
                        {path}
                      {/if}
                    </div>
                  </div>
                  {#if result.type === "chat"}
                    <div class="text-muted flex-shrink-0 text-xs">Chat</div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      {#if getFilteredResults().length > 0}
        <div class="border-border bg-background/50 border-t px-4 py-2">
          <div class="text-muted flex items-center justify-between text-xs">
            <div class="flex items-center gap-4">
              <span
                ><kbd class="bg-background border-border rounded border px-1"
                  >↑↓</kbd
                > Navigate</span
              >
              <span
                ><kbd class="bg-background border-border rounded border px-1"
                  >↵</kbd
                > Select</span
              >
              <span
                ><kbd class="bg-background border-border rounded border px-1"
                  >Esc</kbd
                > Close</span
              >
            </div>
            <div>
              {getFilteredResults().length} result{getFilteredResults()
                .length === 1
                ? ""
                : "s"}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
