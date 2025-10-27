<!-- src/renderer/src/windows/xterm-window/XtermWindowApp.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import XtermStream from "../../components/xterm/XtermStream.svelte";
  import { ptyStreamManager } from "../../services/pty-stream-manager.js";
  import type { PtyStream } from "../../services/pty-stream-manager.js";

  const logger = new Logger({ name: "XtermWindowApp" });

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
      const existingStream = ptyStreamManager.getOrAttachStream(ptySessionId);
      if (existingStream) {
        stream = existingStream;
        logger.info(
          "Successfully retrieved pty stream for session:",
          ptySessionId,
        );
      } else {
        error = `PTY stream not found for session ID: ${ptySessionId}. The stream may have been closed or not initialized correctly.`;
        logger.error(error);
      }
    } catch (e) {
      error = `Failed to retrieve PTY stream: ${e instanceof Error ? e.message : String(e)}`;
      logger.error(error, e);
    }
  });

  // Note: onDestroy does not run when the Electron window is closed
  // The window closes immediately without giving the renderer a chance to cleanup
  // PTY cleanup is now handled in the main process (xterm-window.ts)
  onDestroy(() => {
    if (stream) {
      logger.info(
        "Disposing PTY stream on component unmount:",
        stream.ptySessionId,
      );
      ptyStreamManager.disposeStream(stream.ptySessionId);
    }
  });
</script>

<div class="bg-background text-foreground flex h-screen flex-col px-1 py-3">
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
