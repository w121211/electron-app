<!-- src/renderer/src/components/PromptEditor.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import { Paperclip, XLg, Send } from "svelte-bootstrap-icons";
  import {
    chatState,
    updateMessageInput,
    savePromptCursorPosition,
  } from "../../stores/chat-store.svelte.js";
  import { uiState } from "../../stores/ui-store.svelte.js";
  import { ptyChatService } from "../../services/pty-chat-service.js";
  import { fileSearchService } from "../../services/file-search-service.js";
  import { fileSearchState } from "../../stores/file-search-store.svelte.js";
  import FileSearchDropdown from "./FileSearchDropdown.svelte";
  import { showToast } from "../../stores/ui-store.svelte.js";

  let promptEditorTextarea = $state<HTMLTextAreaElement>();

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
    uiState.promptEditorOpen = false;
  }

  function handleInputChange(value: string): void {
    updateMessageInput(value);

    // Handle @ file reference detection
    fileSearchService.detectFileReference(value, promptEditorTextarea ?? null);
  }

  async function handleSendMessage(): Promise<void> {
    if (!chatState.messageInput.trim()) {
      return;
    }

    if (!chatState.currentChat) {
      showToast("Open a PTY session to send commands", "info");
      return;
    }

    if (chatState.currentChat.sessionType !== "pty_chat") {
      showToast(
        "Prompt editor is only available for PTY sessions now.",
        "info",
      );
      return;
    }

    await ptyChatService.createPtyChatFromDraft(chatState.messageInput.trim());
  }

  function handleKeyPress(event: KeyboardEvent): void {
    // Skip if IME is composing to fix Chinese input issues
    if (event.isComposing) return;

    // Handle search menu navigation first
    const handled = fileSearchService.handleSearchKeydown(
      event,
      promptEditorTextarea ?? null,
      chatState.messageInput,
    );

    if (handled) return;

    // Handle tab indentation
    switch (event.key) {
      case "Tab": {
        if (!promptEditorTextarea) return;

        event.preventDefault();

        if (event.shiftKey) {
          // Shift+Tab: Remove 2 spaces if they exist before cursor
          const cursorPos = promptEditorTextarea.selectionStart;
          const value = chatState.messageInput;

          if (
            cursorPos >= 2 &&
            value.slice(cursorPos - 2, cursorPos) === "  "
          ) {
            promptEditorTextarea.setSelectionRange(cursorPos - 2, cursorPos);
            document.execCommand("delete");
          }
        } else {
          // Tab: Insert 2 spaces
          document.execCommand("insertText", false, "  ");
        }
        break;
      }
    }
  }

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      fileSearchService.cleanup();
    };
  });
</script>

<div class="bg-surface mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-3">
  <!-- Header -->
  <div class="flex h-8 items-center justify-between pl-3" role="toolbar">
    <!-- Left Controls -->
    <div class="flex items-center gap-3">
      <button
        title="Attach"
        class="text-muted hover:text-accent cursor-pointer"
      >
        <Paperclip width="14" height="14" />
      </button>
      <span class="text-muted text-xs uppercase">PTY Command</span>
    </div>
    <!-- Right Controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={handleSendMessage}
        disabled={!chatState.messageInput.trim() || !chatState.currentChat}
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5 disabled:cursor-not-allowed"
        title="Send Message"
      >
        <Send />
      </button>
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
      onkeydown={handleKeyPress}
      placeholder="Prompt editor, use '/' for commands, or @path/to/file"
      class="placeholder-muted h-full w-full flex-1 resize-none border-none bg-transparent p-4 text-[13px] leading-6 outline-none placeholder:text-sm"
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

<!-- <style>
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
</style> -->
