<!-- src/renderer/src/components-new-ui/App.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import MainLayout from "./MainLayout.svelte";
  import ToastProvider from "./ToastProvider.svelte";
  import { eventService } from "../services/event-service.js";
  import { projectService } from "../services/project-service.js";
  import { keyboardManager } from "../lib/keyboard.js";

  const logger = new Logger({ name: "NewApp" });

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    logger.info("New UI App started, initializing systems...");

    // Start event subscriptions
    eventService.start();

    // Open specified tree node on app initialization (development only)
    setTimeout(async () => {
      await projectService.selectFile(
        "/Users/cw/Documents/GitHub/my-todos/chat1.chat.json",
      );
    }, 1000); // 1 second delay to ensure full app initialization

    // Cleanup on destroy
    return () => {
      logger.info("New UI App unmounting, cleaning up...");
      eventService.stop();
      keyboardManager.destroy();
    };
  });

  function handleError(error: Error, errorInfo: unknown): void {
    console.error("Application error:", error, errorInfo);
  }
</script>

<!-- Main App -->
<div class="font-sans">
  <MainLayout />
  <ToastProvider />
</div>
