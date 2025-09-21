<!-- src/renderer/src/components/pty-chat/PtyChat.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { onMount, onDestroy } from "svelte";
  import { Logger } from "tslog";
  import type { ChatSessionData } from "../../../../core/services/chat-engine/chat-session-repository";
  import { getModelMessageContentString } from "../../utils/message-helper.js";

  const logger = new Logger({ name: "PtyChat" });

  let {
    chat,
    isReadOnly = false,
  }: {
    chat: ChatSessionData;
    isReadOnly?: boolean;
  } = $props();

  let terminalElement: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let webglAddon: WebglAddon;
  let resizeObserver: ResizeObserver;

  onMount(() => {
    if (!terminalElement) return;

    console.log("Initializing terminal for chat", chat.id);

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
      // Disable input if the session is terminated
      // disableStdin: isReadOnly || chat.sessionStatus === "external_terminated",
    });

    fitAddon = new FitAddon();
    webglAddon = new WebglAddon();

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();

    // Handle resizing
    resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const newDims = fitAddon.proposeDimensions();
      const sessionId = chat.metadata?.external?.pty?.ptyInstanceId;
      if (sessionId && newDims) {
        window.api.pty.resize(sessionId, newDims);
      }
    });
    resizeObserver.observe(terminalElement);

    // --- Session Handling ---
    const ptyInstanceId = chat.metadata?.external?.pty?.ptyInstanceId;

    if (chat.sessionStatus === "external_terminated") {
      // 4. Frontend Opens a Deactivated (Terminated) PTY Chat
      logger.info(`Loading terminated session ${chat.id} in read-only mode.`);
      // Write historical messages to the terminal
      for (const msg of chat.messages) {
        const content = getModelMessageContentString(msg.message);
        // Simple formatting to distinguish user/assistant
        const prefix = msg.message.role === "user" ? "$ " : "";
        terminal.write(prefix + content.replace(/\n/g, "\r\n") + "\r\n");
      }
      terminal.write("\r\n[Session has ended]\r\n");
    } else if (ptyInstanceId) {
      // 3. Frontend Opens an Active PTY Chat
      logger.info(`Attaching to active session ${ptyInstanceId}`);
      window.api.pty.attach(ptyInstanceId);

      // 2. Frontend Interacts with an Active PTY Session
      terminal.onData((data: string) => {
        console.log("terminal onData", data);
        window.api.pty.write(ptyInstanceId, data);
      });

      window.api.pty.onData((id: string, data: string) => {
        console.log("pty onData", id, data);
        if (id === ptyInstanceId) {
          terminal.write(data);
        }
      });

      window.api.pty.onExit((id: string, exitCode: number) => {
        if (id === ptyInstanceId) {
          logger.info(`Terminal session ${id} exited with code: ${exitCode}`);
          terminal.write(
            `\r\n\r\n[Process completed with exit code ${exitCode}]`,
          );
          terminal.options.disableStdin = true; // Disable input after exit
        }
      });

      if (dims) {
        window.api.pty.resize(ptyInstanceId, dims);
      }
    }
  });

  onDestroy(() => {
    console.debug("onDestroy for chat ${chat.absoluteFilePath}");
    logger.info(`Cleaning up terminal for chat ${chat.absoluteFilePath}`);
    resizeObserver?.disconnect();
    terminal?.dispose();
    webglAddon?.dispose();
    fitAddon?.dispose();
    // Remove all listeners to prevent memory leaks from re-renders
    window.api.pty.removeAllListeners();
  });
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="PTY Terminal"
  class="bg-background h-full w-full"
></div>
