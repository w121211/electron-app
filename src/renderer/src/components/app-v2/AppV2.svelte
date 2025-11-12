<!-- src/renderer/src/components/prompt-centric/AppV2.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import { Toaster } from "svelte-sonner";
  import { keyboardManager } from "../../lib/keyboard.js";
  import { uiV2State } from "../../stores/ui-v2-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import QuickLauncher from "../QuickLauncher.svelte";
  import UserSettings from "../UserSettings.svelte";
  import LightVerticalNav from "./LightVerticalNav.svelte";
  import LightInbox from "./LightInbox.svelte";

  const logger = new Logger({ name: "AppV2" });

  onMount(() => {
    let cancelled = false;

    const bootstrap = async (): Promise<void> => {
      try {
        await projectService.loadProjectFolders();
        await modelClientService.hydrateAvailableModelsV2();
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

  onDestroy(() => {
    keyboardManager.destroy();
  });
</script>

<div class="flex h-screen overflow-hidden font-sans">
  <LightVerticalNav />

  <!-- Center -->
  {#if uiV2State.centerPanelView === "settings"}
    <UserSettings />
  {:else}
    <LightInbox />
  {/if}

  <!-- Overlays -->
  {#if uiV2State.quickLauncherOpen}
    <QuickLauncher isOpen={uiV2State.quickLauncherOpen} />
  {/if}

  <Toaster />
</div>
