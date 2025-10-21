<!-- src/renderer/src/components/XtermSnapshots.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onDestroy, onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import type { PtyChatSnapshot } from "../../../../core/services/chat/chat-session-repository.js";

  let { snapshots = [] }: { snapshots?: PtyChatSnapshot[] } = $props();

  let terminalElement: HTMLDivElement;
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const applySnapshot = (): void => {
    if (!terminal) return;
    terminal.reset();

    if (snapshots.length > 0) {
      // Sort by timestamp to find the most recent snapshot
      const latestSnapshot = [...snapshots].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0];

      if (latestSnapshot && latestSnapshot.snapshot) {
        terminal.write(latestSnapshot.snapshot);
      }
    }

    terminal.scrollToTop();
    queueMicrotask(() => {
      fitAddon?.fit();
    });
  };

  onMount(() => {
    terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      fontSize: 12,
      theme: {
        background: "#181818",
        foreground: "#cccccc",
      },
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    applySnapshot();

    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    resizeObserver.observe(terminalElement);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    fitAddon?.dispose();
    terminal?.dispose();
    terminal = null;
    fitAddon = null;
    resizeObserver = null;
  });

  $effect(() => {
    applySnapshot();
  });
</script>

<div
  bind:this={terminalElement}
  class="xterm-snapshot h-full w-full"
  aria-hidden="true"
>
  <!-- Terminal will be mounted here -->
</div>
