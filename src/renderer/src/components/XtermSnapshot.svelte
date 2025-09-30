<!-- src/renderer/src/components/XtermSnapshot.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onDestroy, onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";

  let { snapshot = "" }: { snapshot?: string } = $props();

  let terminalElement: HTMLDivElement;
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const applySnapshot = (value: string): void => {
    if (!terminal) return;
    terminal.reset();
    if (value) {
      terminal.write(value);
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

    applySnapshot(snapshot);

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
    applySnapshot(snapshot);
  });
</script>

<div
  bind:this={terminalElement}
  class="xterm-snapshot h-full w-full"
  aria-hidden="true"
>
  <!-- Terminal will be mounted here -->
</div>

<style>
  :global(.xterm-snapshot .xterm) {
    pointer-events: auto;
  }

  :global(.xterm-snapshot .xterm .xterm-cursor-layer) {
    display: none;
  }

  :global(.xterm-snapshot .xterm .xterm-viewport) {
    scrollbar-width: thin;
  }
</style>
