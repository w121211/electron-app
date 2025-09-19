<!-- src/renderer/src/components-new-ui/XtermFitted.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { ptyClient, type PtySession } from "../services/pty-client";
  import { Logger } from "tslog";

  const logger = new Logger({ name: "XtermFitted" });

  // let terminalDivContainer: HTMLDivElement;
  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let session: PtySession | null = null;
  let isInitialized = false;
  let resizeObserver: ResizeObserver;
  let resizeTimeout: ReturnType<typeof setTimeout>;

  onMount(async () => {
    if (isInitialized || !terminalElement) return;

    await initializeTerminal();

    const fitTerminal = (): void => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();

      if (session && dims) {
        session.resize(dims.cols, dims.rows);
      }
    };

    const debouncedFitTerminal = (): void => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(fitTerminal, 100);
    };

    resizeObserver = new ResizeObserver(debouncedFitTerminal);
    resizeObserver.observe(terminalElement);

    isInitialized = true;
  });

  onDestroy(() => {
    cleanup();
  });

  async function initializeTerminal(): Promise<void> {
    terminal = new Terminal({
      // fontSize: 14,
      // fontFamily: "'Cascadia Code', 'Roboto Mono', monospace",
      // theme: {
      //   background: "#181818",
      //   foreground: "#cccccc",
      //   cursor: "#ffffff",
      // },
      // cursorBlink: true,
      // allowProposedApi: true,
      // convertEol: true,
      // macOptionIsMeta: true,
      // scrollOnUserInput: true,
    });

    fitAddon = new FitAddon();
    webglAddon = new WebglAddon();

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    fitAddon.fit();
    // console.log(fitAddon.proposeDimensions());
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
      logger.info(`Terminal session exited with code: ${exitCode}`);
      terminal?.write(`

    [Process completed]`);
    });

    terminal.onData((data: string) => {
      session?.write(data);
    });

    logger.info("Terminal initialized successfully", {
      sessionId: session.sessionId,
    });
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

    logger.info("Terminal cleanup completed");
  }
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="Terminal"
  class="h-full w-full"
>
  <!-- Terminal will be mounted here -->
</div>

<style>
  /* .terminal-container {
    width: 100%;
    height: 100%;
  } */
</style>
