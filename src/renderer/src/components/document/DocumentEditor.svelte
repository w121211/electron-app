<!-- src/renderer/src/components/DocumentEditor.svelte -->
<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { XLg } from "svelte-bootstrap-icons";
  import { documentClientService } from "../../services/document-client-service.js";
  import { getSelectedDocContext } from "../../stores/ui.svelte.js";
  import {
    lineColumnToOffset,
    offsetToLineColumn,
  } from "../../utils/editor-utils.js";
  import { Logger } from "tslog";

  const logger = new Logger({ name: "DocumentEditor" });

  let {
    onClose,
  }: {
    onClose?: () => void;
  } = $props();

  const docContext = $derived.by(getSelectedDocContext);
  const editorView = $derived(docContext?.editorViewState);

  // IMPORTANT: This state is initialized only once and does not react to prop changes.
  // The component relies on its parent using a `{#key filePath}` block to force a
  // re-mount on file changes, which is the pattern that ensures this state is reset.
  let inputValue = $state(editorView?.unsavedContent ?? "");
  let editorTextarea = $state<HTMLTextAreaElement>();

  onDestroy(() => {
    tick().then(() => handleClose());
  });

  // Sync from local state to the document service when user input changes `inputValue`.
  $effect(() => {
    if (docContext?.filePath && inputValue !== editorView?.unsavedContent) {
      documentClientService.updateEditorViewState(docContext.filePath, {
        unsavedContent: inputValue,
      });
    }
  });

  // Auto-save effect for documents with 1-second debounce.
  // $effect(() => {
  //   const filePath = docContext?.filePath;
  //   const content = editorView?.unsavedContent;

  //   if (!filePath || !content) return;

  //   const timer = setTimeout(() => {
  //     if (isDirty(filePath, content)) {
  //       documentClientService.saveDocument(filePath, content);
  //     }
  //   }, 1000);

  //   return () => {
  //     clearTimeout(timer);
  //   };
  // });

  $effect(() => {
    if (editorTextarea) {
      tick().then(handleFocus);
    }
  });

  // Auto-focus textarea when opened and restore cursor position
  const handleFocus = (): void => {
    if (!editorTextarea) return;
    editorTextarea.focus();

    const selection = editorView?.selections?.[0];
    if (selection) {
      try {
        const startOffset = lineColumnToOffset(inputValue, selection.anchor);
        const endOffset = lineColumnToOffset(inputValue, selection.head);
        editorTextarea.setSelectionRange(startOffset, endOffset);
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
        editorTextarea.setSelectionRange(offset, offset);
      } catch (e) {
        console.error("Failed to restore cursor position:", e);
      }
    }
  };

  const handleClose = (): void => {
    logger.debug("Closing document editor...");

    // Save cursor position when editor is about to close
    if (editorTextarea && docContext?.filePath) {
      const { selectionStart, selectionEnd } = editorTextarea;
      const anchor = offsetToLineColumn(inputValue, selectionStart);
      const head = offsetToLineColumn(inputValue, selectionEnd);

      documentClientService.updateEditorViewState(docContext.filePath, {
        selections: [{ anchor, head }],
        cursor: head,
      });
    }

    // Save any unsaved changes when the component unmounts.
    if (
      docContext?.filePath &&
      editorView?.unsavedContent !== docContext.documentState.data.content
    ) {
      logger.debug("Saving on unmount...", {
        unsavedContent: editorView?.unsavedContent,
        docContent: docContext.documentState.data.content,
      });
    }

    onClose?.();
  };

  const handleSave = async (): Promise<void> => {
    if (!docContext?.filePath) return;

    await documentClientService.saveDocument(docContext.filePath, inputValue);
  };

  const handleKeyPress = (event: KeyboardEvent): void => {
    // Skip if IME is composing to fix Chinese input issues
    if (event.isComposing) return;

    // Handle tab indentation
    switch (event.key) {
      case "Tab": {
        if (!editorTextarea) return;

        event.preventDefault();

        if (event.shiftKey) {
          // Shift+Tab: Remove 2 spaces if they exist before cursor
          const cursorPos = editorTextarea.selectionStart;
          const value = inputValue;

          if (
            cursorPos >= 2 &&
            value.slice(cursorPos - 2, cursorPos) === "  "
          ) {
            editorTextarea.setSelectionRange(cursorPos - 2, cursorPos);
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
      <span class="text-muted text-xs uppercase">Edit File</span>
    </div>
    <!-- Right Controls -->
    <div class="flex items-center gap-2">
      <button
        onclick={handleSave}
        class="text-muted hover:text-accent cursor-pointer rounded px-2 py-1 text-[13px]"
        title="Save"
      >
        Save
      </button>
      <button
        onclick={handleClose}
        class="text-muted hover:text-accent cursor-pointer rounded"
        title="Close without saving"
      >
        <XLg />
      </button>
    </div>
  </div>
  <!-- Textarea -->
  <div class="relative flex flex-1 flex-col">
    <textarea
      bind:this={editorTextarea}
      bind:value={inputValue}
      onkeydown={handleKeyPress}
      placeholder="Start typing..."
      class="h-full w-full flex-1 resize-none border-none bg-transparent p-4 text-[13px] leading-6 outline-none placeholder:text-sm"
    ></textarea>
  </div>
</div>
