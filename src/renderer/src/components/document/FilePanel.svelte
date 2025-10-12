<!-- src/renderer/src/components/FilePanel.svelte -->
<script lang="ts">
  import { Pencil } from "svelte-bootstrap-icons";
  import { ui, getSelectedDocContext } from "../../stores/ui.svelte.js";
  import { uiState, showToast } from "../../stores/ui-store.svelte.js";
  import { documentClientService } from "../../services/document-client-service.js";
  // import {
  //   chatState,
  //   updateMessageInput,
  // } from "../stores/chat-store.svelte.js";
  import MarkdownTodoRenderer from "../MarkdownTodoRenderer.svelte";
  import Breadcrumb from "../Breadcrumb.svelte";
  import NavigationButtons from "../NavigationButtons.svelte";
  import DocumentEditor from "./DocumentEditor.svelte";

  let isEditing = $state(false);
  let editorContent = "";

  const activeContext = $derived(getSelectedDocContext());
  const activeDocument = $derived(activeContext?.documentState ?? null);

  const openEditor = (): void => {
    const content =
      activeContext?.editorViewState?.unsavedContent ??
      activeDocument?.savedContent ??
      "";

    editorContent = content;
    isEditing = true;
  };

  const closeEditor = (): void => {
    isEditing = false;
  };

  const onDocumentEditorInput = (newValue: string): void => {
    editorContent = newValue;
    if (ui.activeFilePath) {
      documentClientService.updateEditorViewState(ui.activeFilePath, {
        unsavedContent: newValue,
      });
    }
  };

  $effect(() => {
    console.log(ui.activeFilePath);
  });
</script>

<!-- {@debug ui} -->

<section class="relative flex min-w-0 flex-1 flex-col">
  <!-- Header with Breadcrumb -->
  <header class="flex h-12 items-center justify-between px-4">
    <div class="flex items-center gap-1">
      <NavigationButtons />

      {#if ui.activeFilePath}
        <div class:ml-3={!uiState.leftPanelOpen}>
          <Breadcrumb filePath={ui.activeFilePath} />
        </div>
      {/if}
    </div>
  </header>

  <!-- File Viewer / Editor -->
  <div class="flex-1 overflow-y-auto">
    {#if isEditing}
      <DocumentEditor value={editorContent} onInput={onDocumentEditorInput} />
    {:else}
      <div class="mx-auto w-full max-w-3xl px-6 py-3">
        <!-- File Toolbar -->
        <div class="flex h-12 flex-shrink-0 items-center justify-end px-4">
          <div class="flex items-center gap-2">
            <button
              onclick={openEditor}
              class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
              title="Edit File"
            >
              <Pencil />
            </button>
          </div>
        </div>

        <!-- File Content -->
        <div class="text-foreground w-full p-4 font-sans text-[13px] leading-6">
          {#if !activeDocument}
            <div class="flex h-full items-center justify-center">
              <p class="text-muted">No file open.</p>
            </div>
          {:else if activeDocument.savedContent}
            <MarkdownTodoRenderer
              content={activeDocument.savedContent}
              projectPath={activeDocument.filePath.substring(
                0,
                activeDocument.filePath.lastIndexOf("/"),
              )}
            />
          {:else}
            <div class="flex h-full items-center justify-center">
              <p class="text-muted">No file content available.</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>
