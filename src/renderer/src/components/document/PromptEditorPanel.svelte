<!-- src/renderer/src/components/document/PromptEditorPanel.svelte -->
<script lang="ts">
  import { documentClientService } from "../../services/document-client-service.js";
  import { uiState } from "../../stores/ui-store.svelte.js";
  import { getSelectedDocContext } from "../../stores/ui.svelte.js";
  import Breadcrumb from "../Breadcrumb.svelte";
  import NavigationButtons from "../NavigationButtons.svelte";
  import PromptEditor from "./PromptEditor.svelte";

  const docContext = $derived.by(getSelectedDocContext);

  const handleClose = (): void => {
    if (docContext?.filePath) {
      documentClientService.closeDocument(docContext.filePath);
    }
  };
</script>

{#if docContext && docContext.documentState?.kind === "promptScript"}
  <section class="bg-surface relative flex min-w-0 flex-1 flex-col">
    <!-- Header with Breadcrumb -->
    <header class="flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-1">
        <NavigationButtons />

        <div class:ml-3={!uiState.leftPanelOpen}>
          <Breadcrumb
            filePath={docContext.filePath}
            hasUnsavedChanges={docContext.isDirty}
          />
        </div>
      </div>
    </header>

    <!-- Use #key to force component re-render when filePath changes to reset input-value state -->
    {#key docContext.filePath}
      <PromptEditor filePath={docContext.filePath} onClose={handleClose} />
    {/key}
  </section>
{/if}
