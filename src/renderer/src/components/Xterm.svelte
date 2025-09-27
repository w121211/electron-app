<!-- src/renderer/src/components/Xterm.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { ptyClient, type PtySession } from "../services/pty-client";

  // Visible flag provided by parent
  let { visible = true }: { visible?: boolean } = $props();

  // let terminalDivContainer: HTMLDivElement;
  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let session: PtySession | null = null;
  let isInitialized = false;
  let resizeObserver: ResizeObserver;
  let resizeTimeout: ReturnType<typeof setTimeout>;
  let lastWidth = 0;
  let lastHeight = 0;

  onMount(async () => {
    if (isInitialized || !terminalElement) return;

    await initializeTerminal();
    const debounced = (): void => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeTerminal, 150);
    };

    resizeObserver = new ResizeObserver(() => {
      if (!visible) return;
      debounced();
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

    const dims = fitAddon.proposeDimensions();

    session = await ptyClient.createSession({
      cols: dims?.cols,
      rows: dims?.rows,
    });

    if (!session) {
      throw new Error("Failed to create terminal session");
    }

    session.onData.on((data: string) => {
      terminal?.write(data);
    });

    session.onExit.on(({ exitCode }) => {
      console.info(`Terminal session exited with code: ${exitCode}`);
      terminal?.write(`

    [Process completed]`);
    });

    terminal.onData((data: string) => {
      session?.write(data);
    });

    console.info("Terminal initialized successfully", {
      sessionId: session.sessionId,
    });

    // Initial resize after mount when visible
    setTimeout(() => {
      if (visible) resizeTerminal();
    }, 100);
  }

  function cleanup(): void {
    terminal.dispose();
    fitAddon.dispose();
    webglAddon.dispose();
    session?.destroy();
    session = null;
    isInitialized = false;

    resizeObserver?.disconnect();
    clearTimeout(resizeTimeout);

    console.info("Terminal cleanup completed");
  }

  // Manual, visibility-aware terminal resize
  function resizeTerminal(): void {
    if (!terminal || !terminalElement) return;

    const rect = terminalElement.getBoundingClientRect();
    // console.log(rect.width, rect.height);
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
      session?.resize(cols, rows);
      console.debug(`Resized to ${cols}x${rows}`);
    }
  }

  // React when visibility changes to true
  $effect(() => {
    if (visible) {
      setTimeout(() => {
        resizeTerminal();
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
>
  <!-- Terminal will be mounted here -->
</div>

<!-- <style>
  .terminal-container {
    width: 100%;
    height: 100%;
  }
</style> -->
