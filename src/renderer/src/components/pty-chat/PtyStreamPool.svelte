<!-- src/renderer/src/components/PtyStreamPool.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import XtermStream from "../xterm/XtermStream.svelte";
  import {
    ptyStreamManager,
    type PtyStream,
  } from "../../services/pty-stream-manager.js";

  let {
    visibleSessionId = null,
    onTerminalReady = () => {}, // Callback to be forwarded to XtermStream for terminal readiness.
  }: {
    visibleSessionId?: string | null;
    onTerminalReady?: (stream: PtyStream) => void; // Type for the new prop
  } = $props();

  let streams = $state<PtyStream[]>([]);

  const refreshStreams = (): void => {
    streams = ptyStreamManager.getAllStreams();
  };

  let unsubscribeStreamsChanged: (() => void) | undefined;

  onMount(() => {
    unsubscribeStreamsChanged =
      ptyStreamManager.onStreamsChanged.on(refreshStreams);
    refreshStreams();
  });

  onDestroy(() => {
    unsubscribeStreamsChanged?.();
  });
</script>

{#each streams as stream (stream.ptySessionId)}
  <XtermStream
    {stream}
    hidden={stream.ptySessionId !== visibleSessionId}
    {onTerminalReady}
  />
{/each}
