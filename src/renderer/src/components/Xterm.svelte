<!-- src/renderer/src/components/Xterm.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { PtyClient, type PtyCreateOptions } from "../services/pty-client";
  import { Logger } from "tslog";

  interface Props {
    createOptions?: PtyCreateOptions;
    theme?: {
      background?: string;
      foreground?: string;
      cursor?: string;
    };
    fontSize?: number;
    fontFamily?: string;
  }

  let { 
    // createOptions = {},
    // theme = {
    //   background: "#1e1e1e",
    //   foreground: "#d4d4d4",
    //   cursor: "#ffffff",
    // },
    fontSize = 12,
    fontFamily = "Monaco, 'Cascadia Code', 'Roboto Mono', monospace",
  }: Props = $props();

  const logger = new Logger({ name: "Xterm" });
  const ptyClient = new PtyClient();

  let terminalElement: HTMLDivElement;
  let terminal: Terminal & { _resizeObserver?: ResizeObserver } = $state();
  let webglAddon: WebglAddon;
  let sessionId: string | null = null;
  let isInitialized = false;
  let isSessionActive = true;

  onMount(async () => {
    try {
      await initializeTerminal();
    } catch (error) {
      logger.error("Failed to initialize terminal:", error);
    }
  });

  onDestroy(() => {
    cleanup();
  });

  async function initializeTerminal(): Promise<void> {
    if (isInitialized) return;

    // Create terminal instance
    terminal = new Terminal({
      fontSize,
      fontFamily,
      // theme,
      cursorBlink: true,
      allowProposedApi: true,
      // scrollback: 1000,
      altClickMovesCursor: false,
      convertEol: true,
      allowTransparency: true,
      disableStdin: false,
      cursorStyle: "block",
      macOptionIsMeta: true,
      scrollOnUserInput: true,
      fastScrollModifier: "alt",
      cols: 80,
      rows: 48,
    });

    // Create fit addon
    // fitAddon = new FitAddon();
    // terminal.loadAddon(fitAddon);

    webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);

    // Open terminal in DOM
    terminal.open(terminalElement);

    // Fit terminal to container
    // fitAddon.fit();

    // Create terminal session
    sessionId = await ptyClient.createSession({
      // ...createOptions,
      cols: terminal.cols,
      rows: terminal.rows,
    });

    if (!sessionId) {
      logger.error("Failed to create terminal session");
      return;
    }

    // Setup terminal data handler
    ptyClient.onSessionData(sessionId, (data: string) => {
      logger.debug(`Received data for session ${sessionId}:`, data);
      if (isSessionActive && terminal) {
        terminal.write(data);
      }
    });

    // Setup terminal exit handler
    ptyClient.onSessionExit(
      sessionId,
      (exitCode: number, signal?: number) => {
        logger.info(`Terminal session exited`, { exitCode, signal });
        isSessionActive = false;
        if (terminal) {
          terminal.write(
            "\r\n\r\n[Process completed with exit code: " + exitCode + "]\r\n",
          );
        }
      },
    );

    // Setup user input handler
    terminal.onData((data: string) => {
      if (sessionId && isSessionActive) {
        ptyClient.writeToSession(sessionId, data);
      }
    });

    // Setup resize handler
    terminal.onResize(({ cols, rows }) => {
      console.log("Terminal resized", { cols, rows });
      //   if (sessionId && isSessionActive) {
      //     ptyClient.resizeSession(sessionId, cols, rows);
      //   }
    });

    // Setup window resize listener
    const resizeObserver = new ResizeObserver(() => {
      // if (terminal && fitAddon) {
      //   fitAddon.fit();
      // }
    });

    if (terminalElement.parentElement) {
      resizeObserver.observe(terminalElement.parentElement);
    }

    // Store cleanup function
    terminal._resizeObserver = resizeObserver;

    isInitialized = true;
    logger.info("Terminal initialized successfully", { sessionId });
  }

  function cleanup(): void {
    // Stop accepting new data
    isSessionActive = false;

    if (terminal?._resizeObserver) {
      terminal._resizeObserver.disconnect();
    }

    if (sessionId) {
      ptyClient.destroySession(sessionId);
      sessionId = null;
    }

    if (terminal) {
      terminal.dispose();
    }

    ptyClient.dispose();
    isInitialized = false;

    logger.info("Terminal cleanup completed");
  }

  // Export functions for external control
  export function focus(): void {
    terminal?.focus();
  }

  export function clear(): void {
    terminal?.clear();
  }

  export function write(data: string): void {
    terminal?.write(data);
  }

  // export function resize(): void {
  //   fitAddon?.fit();
  // }

  export function getSessionId(): string | null {
    return sessionId;
  }

  export function getCurrentSize(): { cols: number; rows: number } | null {
    if (!terminal) return null;
    return {
      cols: terminal.cols,
      rows: terminal.rows,
    };
  }
</script>

<div bind:this={terminalElement} role="application" aria-label="Terminal">
  <!-- Terminal will be mounted here -->
</div>

<style>
  /* .xterm-container {
    width: 100%;
    height: 100%;
    position: relative;
  } */

  /* Import xterm.js CSS styles */
  /* @import "@xterm/xterm/css/xterm.css"; */

  /* Custom terminal styling */
  /* :global(.xterm) {
    height: 100% !important;
    width: 100% !important;
  } */

  /* :global(.xterm-viewport) {
    background-color: transparent !important;
  } */

  /* :global(.xterm-screen) {
    padding: 8px;
  } */

  /* Focus styling */
  /* :global(.xterm.focus) {
    outline: none;
  }

  :global(.xterm .xterm-cursor-layer .xterm-cursor) {
    opacity: 1;
  } */
</style>