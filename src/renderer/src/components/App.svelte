<!-- src/renderer/src/components/App.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import { keyboardManager } from "../lib/keyboard.js";
  import { eventService } from "../services/event-service.js";
  import { projectService } from "../services/project-service.js";
  import { documentClientService } from "../services/document-client-service.js";
  import MainLayout from "./MainLayout.svelte";
  import ToastProvider from "./ToastProvider.svelte";

  const logger = new Logger({ name: "App" });

  let unsubscribeQuickPrompt: (() => void) | null = null;

  onMount(() => {
    logger.info("UI App started, initializing systems...");

    // Start event subscriptions
    eventService.start();

    if (window.api.quickPrompt?.onLaunch) {
      unsubscribeQuickPrompt = window.api.quickPrompt.onLaunch(
        async (payload) => {
          logger.info("Launching chat from quick prompt", payload);
          try {
            await projectService.refreshProjectTreeForFile(payload.scriptPath);
          } catch (error) {
            logger.warn(
              "Failed to refresh project tree for quick prompt file",
              error,
            );
          }

          try {
            await documentClientService.openDocument(payload.scriptPath, {
              focus: true,
            });
          } catch (error) {
            logger.error(
              "Failed to open prompt script from quick prompt",
              error,
            );
          }
        },
      );
    }

    // Open specified tree node on app initialization (development only)
    setTimeout(async () => {
      await projectService.selectFile(
        "/Users/cw/Documents/GitHub/electron-app/chats/1.prompt.md",
      );
    }, 1000); // 1 second delay to ensure full app initialization
  });

  onDestroy(() => {
    logger.info("UI App unmounting, cleaning up...");
    eventService.stop();
    keyboardManager.destroy();
    unsubscribeQuickPrompt?.();
  });
</script>

<!-- Main App -->
<div class="bg-bg flex h-screen flex-col overflow-hidden font-sans">
  <div class="flex-grow overflow-hidden">
    <MainLayout />
  </div>
  <ToastProvider />
</div>
