<!-- src/renderer/src/components/App.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import { keyboardManager } from "../lib/keyboard.js";
  import { eventService } from "../services/event-service.js";
  // import { projectService } from "../services/project-service.js";
  import { userSettingsService } from "../services/user-settings-service.js";
  import { ui } from "../stores/ui.svelte.js";
  import MainLayout from "./MainLayout.svelte";
  import ToastProvider from "./ToastProvider.svelte";

  const logger = new Logger({ name: "App" });
  let removeNavigationListener: (() => void) | null = null;

  onMount(async () => {
    logger.info("UI App started, initializing systems...");

    // Load user settings
    await userSettingsService.loadSettings();

    // Start event subscriptions
    eventService.start();

    // Open specified tree node on app initialization (development only)
    // setTimeout(async () => {
    //   await projectService.selectFile(
    //     "/Users/cw/Documents/GitHub/electron-app/chats/1.prompt.md",
    //   );
    // }, 1000); // 1 second delay to ensure full app initialization

    removeNavigationListener = window.api.mainWindow.onNavigate((payload) => {
      if (payload.target === "dashboard") {
        ui.activeFilePath = null;
        ui.promptEditorOpen = false;
        ui.settingsPanelOpen = false;
      }
    });
  });

  onDestroy(() => {
    logger.info("UI App unmounting, cleaning up...");
    eventService.stop();
    keyboardManager.destroy();
    removeNavigationListener?.();
    removeNavigationListener = null;
  });
</script>

<!-- Main App -->
<div class="bg-bg flex h-screen flex-col overflow-hidden font-sans">
  <div class="flex-grow overflow-hidden">
    <MainLayout />
  </div>
  <ToastProvider />
</div>
