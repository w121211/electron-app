<!-- src/renderer/src/components/PromptEditor.svelte -->
<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Paperclip, XLg, Send } from "svelte-bootstrap-icons";
  import { chatService } from "../../services/chat-service.js";
  import { documentClientService } from "../../services/document-client-service.js";
  import { fileSearchService } from "../../services/file-search-service.js";
  import { projectService } from "../../services/project-service.js";
  import {
    getLinkedChatSession,
    chatSettings,
    chatSessions,
    chatSessionLinks,
  } from "../../stores/chat.svelte.js";
  import { editorViews } from "../../stores/editor-views.svelte.js";
  import { fileSearchState } from "../../stores/file-search-store.svelte.js";
  import { showToast } from "../../stores/ui-store.svelte.js";
  import {
    lineColumnToOffset,
    offsetToLineColumn,
  } from "../../utils/editor-utils.js";
  import FileSearchDropdown from "./FileSearchDropdown.svelte";
  import ModelSelectorDropdown from "./ModelSelectorDropdown.svelte";
  import { getSelectedDocContext } from "../../stores/ui.svelte.js";

  let {
    headerText,
  }: {
    headerText?: string;
  } = $props();

  // const chatSession = $derived(getLinkedChatSession(filePath));
  // const editorView = $derived(editorViews.get(filePath));
  const docContext = $derived.by(getSelectedDocContext);
  const editorView = $derived(docContext?.editorViewState);
  const chatSession = $derived(docContext?.chatSessionState);

  // IMPORTANT: This state is initialized only once and does not react to prop changes.
  // The component relies on its parent using a `{#key filePath}` block to force a
  // re-mount on file changes, which is the pattern that ensures this state is reset.
  let inputValue = $state(editorView?.unsavedContent ?? "");
  let promptEditorTextarea = $state<HTMLTextAreaElement>();

  $inspect(chatSessions);
  $inspect(chatSessionLinks);
  $inspect(editorView?.unsavedContent);
  $inspect(chatSession);

  onDestroy(() => {
    handleClose();

    fileSearchService.cleanup();
  });

  // Sync from local state to the document service when user input changes `inputValue`.
  $effect(() => {
    // console.log(inputValue, editorView?.unsavedContent);
    if (docContext?.filePath && inputValue !== editorView?.unsavedContent) {
      documentClientService.updateEditorViewState(docContext.filePath, {
        unsavedContent: inputValue,
      });
      fileSearchService.detectFileReference(
        inputValue,
        promptEditorTextarea ?? null,
      );
    }
  });

  // Auto-save effect for prompt scripts with 1-second debounce.
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    inputValue; // Re-run when inputValue changes to create a debounce

    const timer = setTimeout(() => {
      if (docContext?.filePath && docContext.isDirty) {
        documentClientService.saveDocument(docContext.filePath).catch((err) => {
          console.error("Auto-save failed", err);
          showToast("Auto-save failed", "error");
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (promptEditorTextarea) {
      tick().then(handleFocus);
    }
  });

  // Auto-focus textarea when opened and restore cursor position
  const handleFocus = (): void => {
    if (!promptEditorTextarea) return;
    promptEditorTextarea.focus();

    const selection = editorView?.selections?.[0];
    if (selection) {
      try {
        const startOffset = lineColumnToOffset(inputValue, selection.anchor);
        const endOffset = lineColumnToOffset(inputValue, selection.head);
        promptEditorTextarea.setSelectionRange(startOffset, endOffset);
        return; // Exit after restoring selection
      } catch (e) {
        console.error("Failed to restore selection:", e);
      }
    }

    // Fallback to cursor if no selection
    const cursor = editorView?.cursor;
    if (cursor) {
      try {
        const offset = lineColumnToOffset(inputValue, cursor);
        promptEditorTextarea.setSelectionRange(offset, offset);
      } catch (e) {
        console.error("Failed to restore cursor position:", e);
      }
    }
  };

  // Save cursor position when prompt editor is about to close
  const handleClose = (): void => {
    if (promptEditorTextarea && docContext?.filePath) {
      const { selectionStart, selectionEnd } = promptEditorTextarea;
      const anchor = offsetToLineColumn(inputValue, selectionStart);
      const head = offsetToLineColumn(inputValue, selectionEnd);

      documentClientService.updateEditorViewState(docContext.filePath, {
        selections: [{ anchor, head }],
        cursor: head,
      });
    }

    // Save any unsaved changes when the component unmounts.
    if (docContext?.filePath) {
      documentClientService.saveDocument(docContext.filePath).catch((err) => {
        console.error("Save on unmount failed", err);
        showToast("Save on unmount failed", "error");
      });
    }
  };

  const handleSendMessage = async (): Promise<void> => {
    const trimmedContent = inputValue.trim();
    if (!trimmedContent) {
      return;
    }

    // If no chat session exists, create a new PTY chat session
    if (!chatSession) {
      const projectFolder = projectService.getProjectFolderForFile(filePath);

      if (!projectFolder) {
        throw new Error(`No project folder found for file: ${filePath}`);
      }

      const workingDirectory = projectFolder.path;
      const modelId = chatSettings.selectedModel;

      await documentClientService.saveDocument(filePath, { keepFocus: true });

      await chatService.createLinkedPtyChatSession({
        scriptPath: filePath,
        workingDirectory,
        modelId,
        initialPrompt: trimmedContent,
      });
      return;
    }

    if (chatSession.data.sessionType !== "pty_chat") {
      showToast(
        "Sending commands is only available for PTY sessions now.",
        "info",
      );
      return;
    }

    // Send prompt to existing session
    await chatService.sendPrompt({
      sessionId: chatSession.data.id,
      prompt: trimmedContent,
    });
  };

  const handleKeyPress = (event: KeyboardEvent): void => {
    // Skip if IME is composing to fix Chinese input issues
    if (event.isComposing) return;

    // Handle search menu navigation first
    const handled = fileSearchService.handleSearchKeydown(
      event,
      promptEditorTextarea ?? null,
      inputValue,
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
          const value = inputValue;

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
  };
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
      <ModelSelectorDropdown position="below" />
      <!-- <span class="text-muted text-xs uppercase"
        >{headerText ?? "PTY Command"}</span
      > -->
    </div>
    <!-- Right Controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={handleSendMessage}
        disabled={!inputValue.trim()}
        class="text-muted hover:text-accent cursor-pointer rounded p-1.5 disabled:cursor-not-allowed"
        title="Send Message"
      >
        <Send />
      </button>
      <button
        onclick={handleClose}
        class="text-muted hover:text-accent cursor-pointer rounded"
        title="Close"
      >
        <XLg />
      </button>
    </div>
  </div>
  <!-- Textarea -->
  <div class="relative flex flex-1 flex-col">
    <textarea
      bind:this={promptEditorTextarea}
      bind:value={inputValue}
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
            inputValue,
          )}
        oncancel={() =>
          fileSearchService.handleSearchCancel(promptEditorTextarea ?? null)}
        onhover={(index) => fileSearchService.handleSearchHover(index)}
        class="absolute right-0 bottom-4 left-0"
      />
    {/if}
  </div>
</div>
