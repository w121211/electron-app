<!-- src/renderer/src/components/PtyChat.svelte -->
<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { Terminal } from "@xterm/xterm";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { FitAddon } from "@xterm/addon-fit";
  import { Logger } from "tslog";
  import type { ChatSessionData } from "../../../core/services/chat-engine/chat-session-repository";
  import { getModelMessageContentString } from "../utils/message-helper.js";

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

  // Reactive effect to initialize and clean up the terminal
  $effect(() => {
    if (!terminalElement) return;

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
      disableStdin: isReadOnly || chat.sessionStatus === "external_terminated",
    });

    fitAddon = new FitAddon();
    const webglAddon = new WebglAddon();

    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);

    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();

    // Handle resizing
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const newDims = fitAddon.proposeDimensions();
      if (chat.metadata?.pty?.sessionId && newDims) {
        window.api.pty.resize(chat.metadata.pty.sessionId, newDims);
      }
    });
    resizeObserver.observe(terminalElement);

    // --- Session Handling ---
    const sessionId = chat.metadata?.pty?.sessionId;

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
    } else if (sessionId) {
      // 3. Frontend Opens an Active PTY Chat
      logger.info(`Attaching to active session ${sessionId}`);
      window.api.pty.attach(sessionId);

      // 2. Frontend Interacts with an Active PTY Session
      terminal.onData((data: string) => {
        window.api.pty.write(sessionId, data);
      });

      window.api.pty.onData((id, data) => {
        if (id === sessionId) {
          terminal.write(data);
        }
      });

      window.api.pty.onExit((id, exitCode) => {
        if (id === sessionId) {
          logger.info(`Terminal session ${id} exited with code: ${exitCode}`);
          terminal.write(
            `\r\n\r\n[Process completed with exit code ${exitCode}]`,
          );
          terminal.options.disableStdin = true; // Disable input after exit
        }
      });

      if (dims) {
        window.api.pty.resize(sessionId, dims);
      }
    }

    // Cleanup function for when the component unmounts or props change
    return () => {
      logger.info(`Cleaning up terminal for chat ${chat.id}`);
      resizeObserver.disconnect();
      terminal.dispose();
      webglAddon.dispose();
      fitAddon.dispose();
      // Remove all listeners to prevent memory leaks from re-renders
      window.api.pty.removeAllListeners();
    };
  });
</script>

<div
  bind:this={terminalElement}
  role="application"
  aria-label="PTY Terminal"
  class="bg-background h-full w-full"
></div>
