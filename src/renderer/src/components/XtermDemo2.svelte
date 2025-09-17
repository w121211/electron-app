<!-- src/renderer/src/components/XtermDemo.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";
  import type { XtermCreateOptions } from "../services/xterm-service";
  import { Logger } from "tslog";

  const logger = new Logger({ name: "XtermDemo" });

  // Demo state
  let basicTerminal = $state<Xterm>();

  // Terminal configurations - will be set after platform info loads
  let basicConfig = $state<XtermCreateOptions>({
    shell: "/bin/bash",
    cwd: "/",
    cols: 80,
    rows: 48,
  });

  let currentTheme = $state("default");
  let fontSize = $state(14);

  function clearTerminal(terminalRef: Xterm | undefined): void {
    if (terminalRef) {
      terminalRef.clear();
    }
  }

  function resizeTerminal(terminalRef: Xterm | undefined): void {
    if (terminalRef) {
      terminalRef.resize();
    }
  }
</script>

<div class="max-h-screen bg-gray-900 p-6 text-white">
  <!-- Demo Content -->
  <Xterm bind:this={basicTerminal} createOptions={basicConfig} />
</div>
