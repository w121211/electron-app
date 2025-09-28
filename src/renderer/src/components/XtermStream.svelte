<!-- src/renderer/src/components/XtermStream.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { type PtyStream } from "../services/pty-stream-manager.js";

  // Hidden flag provided by parent
  let {
    hidden = false,
    ptyStream,
  }: {
    hidden?: boolean;
    ptyStream: PtyStream;
  } = $props();

  // let terminalDivContainer: HTMLDivElement;
  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let attachedStream: PtyStream | null = null;
  let isInitialized = false;
  let resizeObserver: ResizeObserver;
  let resizeTimeout: ReturnType<typeof setTimeout>;
  let lastWidth = 0;
  let lastHeight = 0;
  let unsubscribeData: (() => void) | undefined;
  let unsubscribeExit: (() => void) | undefined;

  const debouncedResizeTerminal = (): void => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeTerminal, 150);
  };

  onMount(async () => {
    if (isInitialized || !terminalElement) return;

    await initializeTerminal();

    resizeObserver = new ResizeObserver(() => {
      debouncedResizeTerminal();
    });
    resizeObserver.observe(terminalElement);

    isInitialized = true;
  });

  onDestroy(() => {
    cleanup();
  });

  async function initializeTerminal(): Promise<void> {
    terminal = new Terminal({
      fontSize: 12,
      // fontFamily: "'Cascadia Code', 'Roboto Mono', monospace",
      theme: {
        background: "#181818",
        foreground: "#cccccc",
        cursor: "#ffffff",
      },
      cursorBlink: true,
      allowProposedApi: true,
      convertEol: true,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
    });

    fitAddon = new FitAddon();
    webglAddon = new WebglAddon();

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    const stream = ptyStream;
    if (!stream) {
      throw new Error("Failed to attach PTY stream");
    }
    attachedStream = stream;

    const dims = fitAddon.proposeDimensions();
    const cols = dims?.cols;
    const rows = dims?.rows;

    if (cols && rows) {
      stream.resize(cols, rows);
    }

    unsubscribeData = stream.onData.on((data: string) => {
      terminal?.write(data);
    });

    unsubscribeExit = stream.onExit.on(({ exitCode }) => {
      console.info(`Terminal session exited with code: ${exitCode}`);
      terminal?.write(`

    [Process completed]`);
    });

    terminal.onData((data: string) => {
      stream.write(data);
    });

    console.info("Terminal initialized successfully", {
      sessionId: stream.ptySessionId,
    });

    // Initial resize after mount when not hidden
    // Disabled: ResizeObserver handles initial resize when terminal renders
    setTimeout(() => {
      debouncedResizeTerminal();
    }, 100);
  }

  function cleanup(): void {
    terminal.dispose();
    fitAddon.dispose();
    webglAddon.dispose();
    unsubscribeData?.();
    unsubscribeExit?.();
    attachedStream = null;
    isInitialized = false;

    resizeObserver?.disconnect();
    clearTimeout(resizeTimeout);

    console.info("Terminal cleanup completed");
  }

  // Manual, visibility-aware terminal resize
  function resizeTerminal(): void {
    if (!terminal || !terminalElement) return;
    if (hidden) return;

    const rect = terminalElement.getBoundingClientRect();
    console.log("resizeTerminal()", rect.width, rect.height);
    if (rect.width === 0 || rect.height === 0) return; // hidden or not laid out

    if (rect.width === lastWidth && rect.height === lastHeight) return;
    lastWidth = rect.width;
    lastHeight = rect.height;

    const dims = fitAddon.proposeDimensions();
    if (!dims) return;

    const { cols, rows } = dims;
    if (
      cols > 0 &&
      rows > 0 &&
      (cols !== terminal.cols || rows !== terminal.rows)
    ) {
      terminal.resize(cols, rows);
      attachedStream?.resize(cols, rows);
      console.debug(`Resized to ${cols}x${rows}`);
    }
  }

  // React when visibility changes
  $effect(() => {
    if (!hidden) {
      setTimeout(() => {
        terminal?.focus();
      }, 0);
    } else if (isInitialized) {
      // Unfocus when hidden to prevent capturing keyboard input
      terminal?.blur();
    }
  });
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="Terminal"
  class="h-full w-full"
  class:hidden
>
  <!-- Terminal will be mounted here -->
</div>
