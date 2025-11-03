<!-- src/renderer/src/components/prompt-centric/InboxLayout.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Logger } from "tslog";
  import { inboxUiState } from "../../stores/inbox-ui-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import InboxVerticalNav from "./InboxVerticalNav.svelte";
  import Inbox from "./Inbox.svelte";
  import QuickLauncher from "../QuickLauncher.svelte";
  import UserSettings from "../UserSettings.svelte";

  const logger = new Logger({ name: "InboxLayout" });

  onMount(() => {
    let cancelled = false;

    const bootstrap = async (): Promise<void> => {
      try {
        await ensureProjectsLoaded();
        await ensureModelsLoaded();
        if (cancelled) {
          return;
        }
      } catch (error) {
        logger.error("Failed to bootstrap inbox layout", error);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  });

  async function ensureProjectsLoaded(): Promise<void> {
    await projectService.loadProjectFolders();
  }

  async function ensureModelsLoaded(): Promise<void> {
    await modelClientService.hydrateAvailableModels();
  }
</script>

<div class="text-foreground flex h-screen overflow-hidden font-sans">
  <InboxVerticalNav />

  {#if inboxUiState.settingsPanelOpen}
    <UserSettings />
  {:else}
    <Inbox />
  {/if}

  {#if inboxUiState.quickLauncherOpen}
    <QuickLauncher isOpen={inboxUiState.quickLauncherOpen} />
  {/if}
</div>
