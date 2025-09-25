<!-- src/renderer/src/components/pty-chat/PtyChat.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { SerializeAddon } from "@xterm/addon-serialize";
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import { ptyStreamManager } from "../../services/pty-stream-manager.js";
  import { getModelMessageContentString } from "../../utils/message-helper.js";
  import { fileService } from "../../services/file-service.js";
  import type { ChatSessionData } from "../../../../core/services/chat-engine/chat-session-repository";

  const logger = new Logger({ name: "PtyChat" });

  let {
    chat,
  }: {
    chat: ChatSessionData;
  } = $props();

  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let serializeAddon: SerializeAddon;
  let resizeObserver: ResizeObserver;
  let resizeTimeout: ReturnType<typeof setTimeout>;
  let idleTimeout: ReturnType<typeof setTimeout>;
  let isIdle = false;

  // Screenshot functionality
  const takeScreenshot = (): void => {
    if (serializeAddon && ptyStream) {
      const serializedContent = serializeAddon.serialize();
      const htmlContent = serializeAddon.serializeAsHTML();

      // Save the snapshot to the PtyStream
      ptyStream.saveTerminalSnapshot(serializedContent);

      logger.info(`Screenshot taken for chat ${chat.absoluteFilePath}`);
      logger.debug("Terminal content (text):", serializedContent.length);
      logger.debug("Terminal content (HTML):", htmlContent.length);
    }
  };

  // Save terminal snapshot to file
  const saveTerminalSnapshotToFile = async (): Promise<void> => {
    if (serializeAddon && ptyStream) {
      const serializedContent = serializeAddon.serialize();

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `terminal-snapshot-${chat.id}-${timestamp}.txt`;

      // Use same directory as chat file
      const chatDir = chat.absoluteFilePath.substring(
        0,
        chat.absoluteFilePath.lastIndexOf("/"),
      );
      const filePath = `${chatDir}/${filename}`;

      try {
        await fileService.writeFile(filePath, serializedContent);
        logger.info(`Terminal snapshot saved to: ${filePath}`);
      } catch (error) {
        logger.error("Failed to save terminal snapshot:", error);
      }
    }
  };

  // Restore terminal buffer from saved snapshot
  const restoreTerminalBuffer = (): void => {
    if (terminal && ptyStream) {
      const savedSnapshot = ptyStream.getTerminalSnapshot();
      if (savedSnapshot) {
        // Temporarily disconnect PTY input
        const wasDisabled = terminal.options.disableStdin;
        terminal.options.disableStdin = true;

        terminal.clear();
        terminal.write(savedSnapshot);

        // Restore the cursor visibility to its last known state from the stream
        if (ptyStream.isCursorVisible) {
          terminal.write("\x1b[?25h"); // Show cursor
        } else {
          terminal.write("\x1b[?25l"); // Hide cursor
        }

        // Restore original input state
        terminal.options.disableStdin = wasDisabled;
      }
    }
  };

  const resetIdleTimer = (): void => {
    clearTimeout(idleTimeout);
    isIdle = false; // Mark as active since we received data
    idleTimeout = setTimeout(() => {
      if (!isIdle) {
        logger.info(`PTY stream idle for chat ${chat.id}, taking screenshot`);
        takeScreenshot();
        isIdle = true; // Mark as idle to prevent repeated screenshots
      }
    }, 2000); // 2 seconds of idle time
  };

  // Derived state for the current PTY stream
  const ptyStream = $derived.by(() => {
    const ptyInstanceId = chat.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      return ptyStreamManager.getOrAttachStream(ptyInstanceId);
    }
    return null;
  });

  onMount(() => {
    logger.info(`Initializing terminal for chat ${chat.id}`);

    terminal = new Terminal({
      fontSize: 12,
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
    serializeAddon = new SerializeAddon();

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);
    terminal.open(terminalElement);

    // Reset terminal to a clean state before restoring the snapshot
    // terminal.reset();
    // Restore any previously saved terminal snapshot
    restoreTerminalBuffer();

    resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitAddon.fit();
        const newDims = fitAddon.proposeDimensions();
        if (ptyStream && newDims) {
          ptyStream.resize(newDims.cols, newDims.rows);
        }
      }, 100);
    });
    resizeObserver.observe(terminalElement);

    // If the session is already terminated, show historical data
    if (chat.sessionStatus === "external_terminated") {
      logger.info(`Loading terminated session ${chat.id} in read-only mode.`);
      terminal.clear();
      for (const msg of chat.messages) {
        const content = getModelMessageContentString(msg.message);
        const prefix = msg.message.role === "user" ? "$ " : "";
        terminal.write(prefix + content.replace(/\n/g, "\n"));
      }
      terminal.write("\n[Session has ended]\n");
      terminal.options.disableStdin = true;
    }
  });

  $effect(() => {
    logger.debug(
      `PTY effect running for chat: ${chat.id}, session: ${ptyStream?.sessionId}`,
    );

    if (ptyStream) {
      logger.info(`Subscribing to PTY session: ${ptyStream.sessionId}`);

      const unsubscribeData = ptyStream.onData.on((data) => {
        terminal.write(data);
        // resetIdleTimer();
      });

      const unsubscribeExit = ptyStream.onExit.on(({ exitCode }) => {
        logger.info(`Terminal session exited with code: ${exitCode}`);
        terminal.write(`\n\n[Process completed with exit code ${exitCode}]`);
        terminal.options.disableStdin = true;
      });

      const unsubscribeEnter = ptyStream.onPressEnter.on(() => {
        logger.info("Enter pressed, saving terminal snapshot to file");
        saveTerminalSnapshotToFile();
      });

      const onDataDisposable = terminal.onData((data: string) => {
        ptyStream.write(data);
      });

      // fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ptyStream.resize(dims.cols, dims.rows);
      }

      return () => {
        logger.info(`Unsubscribing from PTY session: ${ptyStream.sessionId}`);
        unsubscribeData();
        unsubscribeExit();
        unsubscribeEnter();
        onDataDisposable.dispose();
        clearTimeout(idleTimeout);

        takeScreenshot();
        terminal.clear();
      };
    }

    return undefined;
  });

  onDestroy(() => {
    logger.info(`Cleaning up terminal for chat ${chat.absoluteFilePath}`);
    clearTimeout(resizeTimeout);
    clearTimeout(idleTimeout);
    resizeObserver.disconnect();
    terminal.dispose();
    webglAddon.dispose();
    fitAddon.dispose();
    serializeAddon.dispose();
  });
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="PTY Terminal"
  class="bg-background h-full w-full"
></div>
