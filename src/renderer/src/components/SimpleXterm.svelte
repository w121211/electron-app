<!-- src/renderer/src/components/SimpleXterm.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { ptyClient, type PtySession } from "../services/pty-client";
  import { Logger } from "tslog";

  const logger = new Logger({ name: "SimpleXterm" });

  let terminalElement: HTMLDivElement;
  let terminal: Terminal | undefined = $state();
  let session: PtySession | null = null;
  let isInitialized = false;

  onMount(async () => {
    // Simplified mount logic
    if (isInitialized) return;
    try {
      await initializeTerminal();
      isInitialized = true;
    } catch (error) {
      logger.error("Failed to initialize terminal:", error);
    }
  });

  onDestroy(() => {
    cleanup();
  });

  async function initializeTerminal(): Promise<void> {
    terminal = new Terminal({
      // All configuration is now internal and fixed
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Roboto Mono', monospace",
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
      cols: 80,
      rows: 24, // Adjusted for a more standard height
    });

    terminal.loadAddon(new WebglAddon());
    terminal.open(terminalElement);

    session = await ptyClient.createSession({
      cols: terminal.cols,
      rows: terminal.rows,
    });

    if (!session) {
      logger.error("Failed to create terminal session");
      return;
    }

    // Simplified Event Handlers
    session.onData.on((data: string) => {
      terminal?.write(data);
    });

    session.onExit.on(({ exitCode }) => {
      logger.info(`Terminal session exited with code: ${exitCode}`);
      terminal?.write(`\r\n\r\n[Process completed]`);
    });

    terminal.onData((data: string) => {
      session?.write(data);
    });

    logger.info("Terminal initialized successfully", {
      sessionId: session.sessionId,
    });
  }

  function cleanup(): void {
    terminal?.dispose();
    session?.destroy();
    session = null;
    isInitialized = false;
    logger.info("Terminal cleanup completed");
  }
</script>

<div bind:this={terminalElement} role="application" aria-label="Terminal" />

<style>
  /* This component has no specific styles. Global xterm styles apply. */
</style>
