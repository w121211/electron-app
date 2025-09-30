<!-- src/renderer/src/components/XtermStream.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { Logger } from "tslog";
  import { type PtyStream } from "../services/pty-stream-manager.js";

  const logger = new Logger({ name: "XtermStream" });

  // Hidden flag provided by parent
  let {
    hidden = false,
    stream,
    onTerminalReady = () => {}, // Callback for when terminal is ready
  }: {
    hidden?: boolean;
    stream: PtyStream;
    onTerminalReady?: (stream: PtyStream) => void;
  } = $props();

  let isTerminalInitialized = $state(false);
  let isTerminalFullyReady = $state(false);

  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let resizeObserver: ResizeObserver;
  let resizeTimeout: ReturnType<typeof setTimeout>;
  let lastWidth = 0;
  let lastHeight = 0;
  let unsubscribeData: (() => void) | undefined;
  let unsubscribeExit: (() => void) | undefined;

  onMount(async () => {
    if (isTerminalInitialized || !terminalElement) return;

    await initializeTerminal();

    resizeObserver = new ResizeObserver(() => {
      debouncedResizeTerminal();
    });
    resizeObserver.observe(terminalElement);

    isTerminalInitialized = true;
  });

  onDestroy(() => {
    cleanup();
  });

  // Effect to call the onTerminalReady callback when the terminal is fully ready
  $effect(() => {
    if (isTerminalFullyReady) {
      logger.debug(
        `XtermStream for session ${stream.ptySessionId} is fully ready. Calling onTerminalReady callback.`,
      );
      onTerminalReady(stream);
    }
  });

  $effect(() => {
    if (!hidden) {
      setTimeout(() => {
        terminal?.focus();
      }, 0);
    } else if (isTerminalInitialized) {
      // Unfocus when hidden to prevent capturing keyboard input
      terminal?.blur();
    }
  });

  const debouncedResizeTerminal = (): void => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeTerminal, 150);
  };

  const initializeTerminal = async (): Promise<void> => {
    terminal = new Terminal({
      fontSize: 12,
      // fontFamily: "'Cascadia Code', 'Roboto Mono', monospace",
      theme: {
        background: "#181818",
        // background: "#cccccc",
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
      logger.info(`Terminal session exited with code: ${exitCode}`);
      terminal?.write(`\r\n    [Process completed]`);
    });

    terminal.onData((data: string) => {
      stream.write(data);
    });

    // Readiness Detection: Wait for initial resize to complete, then for the first render
    const disposeResizeListener = terminal.onResize(() => {
      logger.debug(`Initial terminal resize complete`);
      disposeResizeListener.dispose(); // Remove resize listener after first resize

      // Now wait for the first render event
      const disposeRenderListener = terminal.onRender(() => {
        logger.debug(`First terminal render complete`);
        disposeRenderListener.dispose(); // Remove render listener after first render
        isTerminalFullyReady = true; // Mark as fully ready
      });
    });

    debouncedResizeTerminal(); // Trigger initial resize check

    logger.info("Terminal initialized successfully", {
      sessionId: stream.ptySessionId,
    });
  };

  const cleanup = (): void => {
    terminal?.dispose(); // Use optional chaining for safety
    fitAddon?.dispose();
    webglAddon?.dispose();
    unsubscribeData?.();
    unsubscribeExit?.();
    isTerminalInitialized = false;
    isTerminalFullyReady = false; // Reset readiness state

    resizeObserver?.disconnect();
    clearTimeout(resizeTimeout);

    logger.debug("Terminal cleanup completed");
  };

  const resizeTerminal = (): void => {
    if (!terminal || !terminalElement || hidden) return;

    const rect = terminalElement.getBoundingClientRect();
    // logger.debug("resizeTerminal()", rect.width, rect.height);
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
      stream.resize(cols, rows);
      // logger.debug(`Resized to ${cols}x${rows}`);
    }
  };
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
