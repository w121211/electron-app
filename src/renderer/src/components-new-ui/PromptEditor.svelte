<!-- src/renderer/src/components-new-ui/PromptEditor.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import { Paperclip, ChevronDown, XLg } from "svelte-bootstrap-icons";
  import {
    chatState,
    updateMessageInput,
    savePromptCursorPosition,
  } from "../stores/chat-store.svelte.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import { chatService } from "../services/chat-service.js";
  import { fileSearchService } from "../services/file-search-service.js";
  import { fileSearchState } from "../stores/file-search-store.svelte.js";
  import FileSearchDropdown from "./file-explorer/FileSearchDropdown.svelte";

  let promptEditorTextarea = $state<HTMLTextAreaElement>();
  let showModelDropdown = $state(false);

  // Chat mode and model options
  const modelOptions = [
    { value: "anthropic/claude", label: "Claude 3.5" },
    { value: "google/gemini", label: "GPT-4" },
    { value: "terminal/claude-code", label: "Gemini Pro" },
  ];

  // Auto-focus textarea when opened and restore cursor position
  $effect(() => {
    if (uiState.promptEditorOpen && promptEditorTextarea) {
      tick().then(() => {
        if (promptEditorTextarea) {
          promptEditorTextarea.focus();
          // Restore cursor position if available
          if (chatState.promptCursorPosition) {
            promptEditorTextarea.setSelectionRange(
              chatState.promptCursorPosition.start,
              chatState.promptCursorPosition.end,
            );
          }
        }
      });
    }
  });

  // Save cursor position when prompt editor is about to close
  function handleClose(): void {
    if (promptEditorTextarea) {
      savePromptCursorPosition(
        promptEditorTextarea.selectionStart,
        promptEditorTextarea.selectionEnd,
      );
    }
    chatService.closePromptEditor();
  }

  function handleInputChange(value: string): void {
    updateMessageInput(value);

    // Handle @ file reference detection
    fileSearchService.detectFileReference(value, promptEditorTextarea ?? null);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    // Handle search menu navigation
    const handled = fileSearchService.handleSearchKeydown(
      event,
      promptEditorTextarea ?? null,
      chatState.messageInput,
    );

    if (handled) return;
  }

  function toggleModelDropdown(): void {
    showModelDropdown = !showModelDropdown;
  }

  function selectModel(modelValue: string): void {
    chatState.selectedModel = modelValue;
    showModelDropdown = false;
  }

  // Close model dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as HTMLElement;
      const modelDropdown = document.querySelector(".relative");

      if (
        showModelDropdown &&
        modelDropdown &&
        !modelDropdown.contains(target)
      ) {
        showModelDropdown = false;
      }
    }

    if (showModelDropdown) {
      document.addEventListener("click", handleClickOutside, true);
      return () =>
        document.removeEventListener("click", handleClickOutside, true);
    }
    return undefined;
  });

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      fileSearchService.cleanup();
    };
  });
</script>

<div
  class="bg-background absolute top-10 right-0 bottom-0 left-0 z-30 mx-auto flex max-w-3xl flex-col px-6 py-3"
>
  <!-- Header -->
  <div class="flex h-8 items-center justify-between pl-3" role="toolbar">
    <!-- Left Controls -->
    <div class="flex items-center gap-3">
      <button
        title="Attach"
        class="text-muted hover:text-accent cursor-pointer"
      >
        <Paperclip />
      </button>
      <!-- Model selector dropdown -->
      <div class="relative">
        <button
          onclick={toggleModelDropdown}
          class="text-muted hover:text-accent flex cursor-pointer items-center gap-1 text-xs"
          title="Select Model"
          disabled={chatState.currentChat &&
            chatState.currentChat.messages.length > 0}
        >
          <span
            >{modelOptions.find((m) => m.value === chatState.selectedModel)
              ?.label || "Claude 3.5"}</span
          >
          {#if !(chatState.currentChat && chatState.currentChat.messages.length > 0)}
            <ChevronDown />
          {/if}
        </button>
        <!-- Dropdown menu -->
        {#if showModelDropdown}
          <div
            class="bg-background border-border absolute top-full left-0 z-10 mt-1 w-36 rounded-md border"
          >
            <div class="py-1">
              {#each modelOptions as option (option.value)}
                <button
                  onclick={() => selectModel(option.value)}
                  class="text-foreground hover:bg-hover block w-full cursor-pointer px-3 py-1 text-left text-sm"
                  class:bg-hover={option.value === chatState.selectedModel}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
    <!-- Right Controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={handleClose}
        class="text-muted hover:text-accent cursor-pointer rounded"
        title="Close Prompt Editor"
      >
        <XLg />
      </button>
    </div>
  </div>
  <!-- Textarea -->
  <div class="relative flex flex-1 flex-col">
    <textarea
      bind:this={promptEditorTextarea}
      bind:value={chatState.messageInput}
      oninput={(e) => handleInputChange(e.currentTarget.value)}
      onkeypress={handleKeyPress}
      onkeydown={handleKeyPress}
      placeholder="Prompt editor, use '/' for commands, or @path/to/file"
      class="scrollbar-thin placeholder-muted h-full w-full flex-1 resize-none border-none bg-transparent p-4 text-sm leading-6 outline-none placeholder:text-sm"
    ></textarea>

    <!-- File Search Dropdown -->
    {#if fileSearchState.showMenu}
      <FileSearchDropdown
        results={fileSearchState.results}
        selectedIndex={fileSearchState.selectedIndex}
        onselect={(file) =>
          fileSearchService.handleFileSelect(
            file,
            promptEditorTextarea ?? null,
            chatState.messageInput,
          )}
        oncancel={() =>
          fileSearchService.handleSearchCancel(promptEditorTextarea ?? null)}
        onhover={(index) => fileSearchService.handleSearchHover(index)}
        class="absolute right-0 bottom-4 left-0"
      />
    {/if}
  </div>
</div>

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
