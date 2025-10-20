<!-- src/renderer/src/windows/xterm-window/XtermApp.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Logger } from "tslog";
  import XtermStream from "../../components/xterm/XtermStream.svelte";
  import { ptyStreamManager } from "../../services/pty-stream-manager.js";
  import type { PtyStream } from "../../services/pty-stream-manager.js";

  const logger = new Logger({ name: "XtermApp" });

  let stream = $state<PtyStream | null>(null);
  let error = $state<string | null>(null);

  onMount(() => {
    const hash = window.location.hash.slice(1);
    logger.info("Xterm window opened with hash:", hash);

    if (!hash) {
      error = "No ptySessionId provided in the URL hash.";
      logger.error(error);
      return;
    }

    const params = new URLSearchParams(hash);
    const ptySessionId = params.get("ptySessionId");

    if (!ptySessionId) {
      error = "ptySessionId not found in URL hash parameters.";
      logger.error(error);
      return;
    }

    logger.info("Attempting to get stream for ptySessionId:", ptySessionId);
    try {
      // The stream should have been created and cached by the main process
      // before this window was opened.
      const existingStream = ptyStreamManager.getStream(ptySessionId);
      if (existingStream) {
        stream = existingStream;
        logger.info("Successfully retrieved pty stream for session:", ptySessionId);
      } else {
        error = `PTY stream not found for session ID: ${ptySessionId}. The stream may have been closed or not initialized correctly.`;
        logger.error(error);
      }
    } catch (e) {
      error = `Failed to retrieve PTY stream: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(error, e);
    }
  });
</script>

<div class="bg-background text-foreground flex h-full flex-col">
  {#if stream}
    <XtermStream {stream} />
  {:else if error}
    <div class="flex h-full w-full items-center justify-center p-4">
      <div class="text-red-400">{error}</div>
    </div>
  {:else}
    <div class="flex h-full w-full items-center justify-center">
      Connecting to terminal stream...
    </div>
  {/if}
</div>
