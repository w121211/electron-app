<!-- src/renderer/src/components-new-ui/App.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import MainLayout from "./MainLayout.svelte";
  import ToastProvider from "./ToastProvider.svelte";
  import { eventService } from "../services/event-service.js";
  import { projectService } from "../services/project-service.js";

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
    };
  });

  function handleError(error: Error, errorInfo: any) {
    logger.error("Application error:", error, errorInfo);
    // Send error to monitoring service in production
    // if (import.meta.env.PROD) {
    //   sendErrorToMonitoring(error, errorInfo)
    // }
  }
</script>

<!-- Main App -->
<div class="font-sans">
  <MainLayout />
  <ToastProvider />
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    font-family: "Inter", "Segoe UI", "Arial", sans-serif;
  }

  :global(#app) {
    height: 100vh;
  }

  /* Apply design system colors */
  :global(:root) {
    --color-background: #131314;
    --color-surface: #131314;
    --color-panel: #1c1c1e;
    --color-border: #2a2a2a;
    --color-foreground: #e4e4e6;
    --color-muted: #8e8e93;
    --color-accent: #60a5fa;
    --color-hover: #2c2c2e;
    --color-selected: #28282a;
    --color-input-background: #1d1d1f;
    --color-input-border: #333333;
  }

  /* Custom scrollbar styling */
  :global(.scrollbar-thin::-webkit-scrollbar) {
    width: 6px;
  }
  :global(.scrollbar-thin::-webkit-scrollbar-thumb) {
    background: #2c2c2e;
    border-radius: 3px;
  }
  :global(.scrollbar-thin::-webkit-scrollbar-track) {
    background: transparent;
  }
</style>