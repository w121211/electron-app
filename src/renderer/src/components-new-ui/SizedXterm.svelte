<!-- src/renderer/src/components-new-ui/SizedXterm.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { ptyClient, type PtySession } from "../services/pty-client";
  import { Logger } from "tslog";
  import {
    getXtermScaledDimensions,
    type ITerminalFont,
  } from "../utils/xterm-utils";

  const logger = new Logger({ name: "SizedXterm" });

  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let session: PtySession | null = null;
  let isInitialized = false;
  let resizeObserver: ResizeObserver;
  let isVisible = false;

  onMount(async () => {
    if (isInitialized || !terminalElement) return;

    try {
      await initializeTerminal();

      resizeObserver = new ResizeObserver(() => {
        console.log("resizeTerminal()");
        resizeTerminal();

        if (!isVisible) {
          terminalElement.style.visibility = "visible";
          isVisible = true;
        }
      });
      resizeObserver.observe(terminalElement);

      isInitialized = true;
    } catch (error) {
      logger.error("Failed to initialize terminal:", error);
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
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
      cursorBlink: true,
      allowProposedApi: true,
      convertEol: true,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
    });

    terminal.loadAddon(new WebglAddon());
    terminal.open(terminalElement);

    session = await ptyClient.createSession({
      cols: 80,
      rows: 24,
    });

    if (!session) {
      logger.error("Failed to create terminal session");
      return;
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

  function resizeTerminal(): { cols: number; rows: number } | undefined {
    console.log("resizeTerminal()", terminal);

    if (
      !terminal ||
      !terminalElement ||
      !(terminal as any)._core?._renderService?.dimensions.css.cell
    ) {
      return;
    }

    const cellDims = (terminal as any)._core._renderService.dimensions.css.cell;
    const fontFamily = terminal.options.fontFamily!;
    const fontSize = terminal.options.fontSize!;
    const letterSpacing = terminal.options.letterSpacing!;
    const lineHeight = terminal.options.lineHeight!;
    const charWidth = cellDims.height / lineHeight!;
    const charHeight =
      cellDims.width - Math.round(letterSpacing) / window.devicePixelRatio;

    const font: ITerminalFont = {
      fontFamily: terminal.options.fontFamily!,
      fontSize: terminal.options.fontSize!,
      letterSpacing: terminal.options.letterSpacing!,
      lineHeight: terminal.options.lineHeight!,
      charWidth: cellDims.height / terminal.options.lineHeight!,
      charHeight:
        cellDims.width - Math.round(letterSpacing) / window.devicePixelRatio,
    };

    const { width, height } = terminalElement.getBoundingClientRect();
    const dimensions = getXtermScaledDimensions(window, font, width, height);

    if (dimensions) {
      const { cols, rows } = dimensions;
      if (terminal.cols !== cols || terminal.rows !== rows) {
        terminal.resize(cols, rows);
        session?.resize(cols, rows);
        logger.info(`Resized terminal to ${cols}x${rows}`);
      }
      return { cols, rows };
    }

    return;
  }

  function cleanup(): void {
    terminal?.dispose();
    session?.destroy();
    session = null;
    isInitialized = false;
    logger.info("Terminal cleanup completed");
  }
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="Terminal"
  class="terminal-container"
  style="visibility: hidden;"
>
  <!-- Terminal will be mounted here -->
</div>

<style>
  /* .terminal-container {
    width: 100%;
    height: 100%;
  } */
</style>
