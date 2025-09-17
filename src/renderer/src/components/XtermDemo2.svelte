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
    shell: undefined, // Will use default from PtyService
    cwd: undefined, // Will use default from PtyService
    cols: 80,
    rows: 24,
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

<div class="max-h-full w-full bg-gray-900 p-6 text-white">
  <!-- Demo Content -->
  <Xterm bind:this={basicTerminal} createOptions={basicConfig} />
</div>
