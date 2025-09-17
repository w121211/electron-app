<!-- src/renderer/src/App.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  // import Demo from "./components/Demo.svelte";
  import MainLayout from "./components/MainLayout.svelte";
  // import MainLayoutDemo from "./components/MainLayoutDemo.svelte";
  // import ToolCallDemo from "./components/ToolCallDemo.svelte";
  import XtermDemo from "./components/XtermDemo2.svelte";
  import ToastProvider from "./components/ToastProvider.svelte";
  // import ErrorBoundary from "./components/ErrorBoundary.svelte";
  // import DevPanel from "./components/shared/DevPanel.svelte";
  // import Versions from "./components/Versions.svelte";
  import { eventService } from "./services/event-service.js";
  import { projectService } from "./services/project-service.js";
  import { trpcClient } from "./lib/trpc-client.js";
  import {
    setUserSettings,
    setUserSettingsError,
    setUserSettingsLoading,
  } from "./stores/user-settings-store.svelte.js";
  // import { keyboardManager } from "./lib/keyboard";
  // import { DevelopmentTools } from "./lib/development";

  const logger = new Logger({ name: "App" });

  // Demo toggle state
  let showXtermDemo = $state(true);

  // Keyboard shortcut to toggle demo (Ctrl/Cmd + Shift + D)
  function handleKeydown(event: KeyboardEvent) {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key === "D"
    ) {
      event.preventDefault();
      showXtermDemo = !showXtermDemo;
      logger.info(`Xterm demo ${showXtermDemo ? "enabled" : "disabled"}`);
    }
  }

  async function loadInitialSettings() {
    setUserSettingsLoading(true);
    try {
      const settings = await trpcClient.userSettings.getSettings.query();
      setUserSettings(settings);
      logger.info("Initial user settings loaded");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setUserSettingsError(errorMessage);
      logger.error("Failed to load initial user settings:", errorMessage);
    } finally {
      setUserSettingsLoading(false);
    }
  }

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    logger.info("App mounted, initializing systems...");

    // Load initial settings
    loadInitialSettings();

    // Start event subscriptions
    eventService.start();

    // Initialize development tools in dev mode
    // if (isDev) {
    //   DevelopmentTools.getInstance();
    // }

    // Setup keyboard shortcuts
    // keyboardManager.enable();

    // Open specified tree node on app initialization (development only)
    setTimeout(async () => {
      await projectService.selectFile(
        "/Users/cw/Documents/GitHub/my-todos/chat1.chat.json",
      );
    }, 1000); // 1 second delay to ensure full app initialization

    // Cleanup on destroy
    return () => {
      logger.info("App unmounting, cleaning up...");
      eventService.stop();
      // keyboardManager.destroy();
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

<!-- Global keyboard event handler -->
<svelte:window on:keydown={handleKeydown} />

<ToastProvider>
  {#if showXtermDemo}
    <div>
      <!-- Demo mode indicator -->
      <div
        class="fixed top-4 right-4 z-50 rounded-md bg-blue-600 px-3 py-1 text-sm text-white shadow-lg"
      >
        Demo Mode - Press Ctrl+Shift+D to exit
      </div>
      <XtermDemo />
    </div>
  {:else}
    <MainLayout />
  {/if}
</ToastProvider>

<!-- <Versions /> -->

<!-- <ErrorBoundary onError={handleError}>
  <ToastProvider>
    {#if showDemo}
      <Demo />
    {:else}
      <MainLayout />
    {/if}

    Development tools (only shown in dev mode)
    <DevPanel />
  </ToastProvider>
</ErrorBoundary> -->
