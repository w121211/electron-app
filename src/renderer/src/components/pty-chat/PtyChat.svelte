<!-- src/renderer/src/components/pty-chat/PtyChat.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import { ptyStreamManager } from "../../services/pty-stream-manager.js";
  import { getModelMessageContentString } from "../../utils/message-helper.js";
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
  let resizeObserver: ResizeObserver;

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

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    fitAddon.fit();

    resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const newDims = fitAddon.proposeDimensions();
      if (ptyStream && newDims) {
        ptyStream.resize(newDims.cols, newDims.rows);
      }
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
    logger.info(
      `PTY effect running for chat: ${chat.id}, session: ${ptyStream?.sessionId}`,
    );

    if (ptyStream) {
      logger.info(`Subscribing to PTY session: ${ptyStream.sessionId}`);

      const unsubscribeData = ptyStream.onData.on((data) => {
        terminal.write(data);
      });

      const unsubscribeExit = ptyStream.onExit.on(({ exitCode }) => {
        logger.info(`Terminal session exited with code: ${exitCode}`);
        terminal.write(`\n\n[Process completed with exit code ${exitCode}]`);
        terminal.options.disableStdin = true;
      });

      const onDataDisposable = terminal.onData((data: string) => {
        ptyStream.write(data);
      });

      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ptyStream.resize(dims.cols, dims.rows);
      }

      return () => {
        logger.info(`Unsubscribing from PTY session: ${ptyStream.sessionId}`);
        unsubscribeData();
        unsubscribeExit();
        onDataDisposable.dispose();

        terminal.clear();
      };
    }

    return undefined;
  });

  onDestroy(() => {
    logger.info(`Cleaning up terminal for chat ${chat.absoluteFilePath}`);
    resizeObserver.disconnect();
    terminal.dispose();
    webglAddon.dispose();
    fitAddon.dispose();
  });
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="PTY Terminal"
  class="bg-background h-full w-full"
></div>
