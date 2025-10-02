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
  import { isCliModelReady } from "../../utils/xterm-utils.js";
  import type { ChatSessionData } from "../../../../core/services/chat/chat-session-repository";
  import { ptyChatService } from "../../services/pty-chat-service.js";

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

  type TerminalState = "initializing" | "ready" | "prompt_written";
  let terminalState: TerminalState = "initializing";

  // Screenshot functionality
  const takeScreenshot = (): void => {
    if (serializeAddon && ptyStream) {
      const serializedContent = serializeAddon.serialize();

      // Save the snapshot to the PtyStream
      ptyStream.saveTerminalSnapshot(serializedContent);

      logger.info(`Screenshot taken for chat ${chat.absoluteFilePath}`);
      // logger.debug("Terminal content (text):", serializedContent.length);
      // logger.debug("Terminal content (HTML):", htmlContent.length);
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

  // @ts-expect-error unused but keeping for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Write initial prompt to terminal without sending enter
  const writeInitialPromptWithoutEnter = (): void => {
    const initialPrompt = chat.metadata?.promptDraft;

    if (!initialPrompt || !ptyStream) {
      logger.warn("No initial prompt or PTY stream available");
      return;
    }

    logger.info(
      `Pre-populating initial prompt: ${initialPrompt.substring(0, 50)}...`,
    );

    // Focus terminal first
    terminal.focus();

    // Write prompt to PTY stream (without \n)
    ptyStream.write(initialPrompt);
  };

  // Derived state for the current PTY stream
  const ptyStream = $derived.by(() => {
    const ptyInstanceId = chat.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      return ptyStreamManager.getOrAttachStream(ptyInstanceId);
    }
    return null;
  });

  // Reset terminal state when PTY stream changes
  // $effect(() => {
  //   if (ptyStream) {
  //     terminalState = "initializing";
  //     logger.debug(
  //       `Reset terminal state to initializing for PTY stream: ${ptyStream.sessionId}`,
  //     );
  //   }
  // });

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

    // Handle Shift+Enter differently from Enter
    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === "keydown" && event.key === "Enter" && event.shiftKey) {
        // Shift+Enter: send newline
        event.preventDefault();
        if (ptyStream) {
          ptyStream.write("\n");
        }
        return false; // Prevent xterm from handling this
      }
      return true; // Let xterm handle other keys
    });

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

        // State transition: initializing → ready
        if (terminalState === "initializing" && isCliModelReady(data)) {
          terminalState = "ready";
          logger.debug("Terminal state: initializing → ready");

          // Small delay to ensure terminal has processed all data
          setTimeout(() => {
            if (terminalState === "ready" && chat.metadata?.promptDraft) {
              terminalState = "prompt_written";
              logger.debug("Terminal state: ready → prompt_written");
              writeInitialPromptWithoutEnter();
            }
          }, 100);
        }

        // resetIdleTimer();
      });

      const unsubscribeExit = ptyStream.onExit.on(({ exitCode }) => {
        logger.info(`Terminal session exited with code: ${exitCode}`);
        terminal.write(`\n\n[Process completed with exit code ${exitCode}]`);
        terminal.options.disableStdin = true;
      });

      const unsubscribeEnter = ptyStream.onPressEnter.on(async () => {
        logger.info("Enter pressed, saving terminal snapshot to metadata");
        if (serializeAddon && ptyStream) {
          const serializedContent = serializeAddon.serialize();
          // const screenshotHtml = serializeAddon.serializeAsHTML();

          // Save to PTY stream (existing functionality)
          ptyStream.saveTerminalSnapshot(serializedContent);

          // Update chat metadata with latest snapshot including HTML
          await ptyChatService.updateMetadata(chat.absoluteFilePath, {
            external: {
              pty: {
                screenshot: serializedContent,
                // screenshotHtml: screenshotHtml,
              },
            },
          });
        }
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
