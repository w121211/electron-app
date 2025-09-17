<!-- src/renderer/src/components/XtermDemo.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";
  import type { XtermCreateOptions } from "../services/xterm-service";
  import { Logger } from "tslog";

  const logger = new Logger({ name: "XtermDemo" });

  // Demo state
  let currentDemo = $state("basic");
  let basicTerminal = $state<Xterm>();
  let replTerminal = $state<Xterm>();
  let customTerminal = $state<Xterm>();

  // Platform info
  let platformInfo = $state<{ platform: string; cwd: string } | null>(null);

  // Terminal configurations - will be set after platform info loads
  let basicConfig = $state<XtermCreateOptions>({
    shell: "/bin/bash",
    cwd: "/",
    cols: 80,
    rows: 48,
  });

  let replConfig = $state<XtermCreateOptions>({
    shell: "node",
    cwd: "/",
    cols: 100,
    rows: 30,
  });

  let customConfig = $state<XtermCreateOptions>({
    shell: "/bin/sh",
    cwd: "/tmp",
    cols: 120,
    rows: 35,
  });

  // Load platform info and update configs
  $effect(() => {
    async function loadPlatformInfo() {
      try {
        platformInfo = await window.api.getPlatformInfo();
        logger.info("Platform info loaded:", platformInfo);

        // Update terminal configurations based on platform
        const isWindows = platformInfo.platform === "win32";

        basicConfig = {
          shell: isWindows ? "powershell.exe" : "/bin/bash",
          cwd: platformInfo.cwd,
          cols: 80,
          rows: 24,
        };

        replConfig = {
          shell: "node",
          cwd: platformInfo.cwd,
          cols: 100,
          rows: 30,
        };

        customConfig = {
          shell: isWindows ? "cmd.exe" : "/bin/sh",
          cwd: "/tmp",
          cols: 120,
          rows: 35,
        };
      } catch (error) {
        logger.error("Failed to load platform info:", error);
        // Keep default configs
      }
    }
    loadPlatformInfo();
  });

  // Theme configurations
  const themes = {
    default: {
      background: "#1e1e1e",
      foreground: "#d4d4d4",
      cursor: "#ffffff",
    },
    green: {
      background: "#0d1117",
      foreground: "#58a6ff",
      cursor: "#7c3aed",
    },
    retro: {
      background: "#000000",
      foreground: "#00ff00",
      cursor: "#00ff00",
    },
  };

  let currentTheme = $state("default");
  let fontSize = $state(14);

  // Demo scenarios
  const demoScenarios = [
    {
      id: "basic",
      name: "Basic Terminal",
      description: "Standard shell with common commands",
    },
    {
      id: "repl",
      name: "Node.js REPL",
      description: "Interactive JavaScript environment",
    },
    {
      id: "custom",
      name: "Custom Terminal",
      description: "Customized appearance and behavior",
    },
    {
      id: "multiple",
      name: "Multiple Sessions",
      description: "Multiple concurrent terminals",
    },
  ];

  // Predefined commands for demos
  const demoCommands = {
    basic: [
      "echo 'Welcome to Xterm Demo!'",
      "pwd",
      "ls -la",
      "date",
      "uname -a",
    ],
    repl: [
      "console.log('Hello from Node.js!')",
      "Math.PI",
      "new Date().toISOString()",
      "[1,2,3].map(x => x * 2)",
      "process.version",
    ],
    custom: ["echo 'Custom terminal session'", "whoami", "env | head -10"],
  };

  function switchDemo(demoId: string): void {
    currentDemo = demoId;
    logger.info(`Switched to demo: ${demoId}`);
  }

  function executeCommand(
    terminalRef: Xterm | undefined,
    command: string,
  ): void {
    if (terminalRef) {
      const sessionId = terminalRef.getSessionId();
      logger.info(`Executing command in session ${sessionId}: ${command}`);
      terminalRef.write(`${command}\n`);
    }
  }

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

  function changeTheme(themeName: string): void {
    currentTheme = themeName;
  }

  function changeFontSize(size: number): void {
    fontSize = size;
  }
</script>

<div class="min-h-screen bg-gray-900 p-6 text-white">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="mb-2 text-3xl font-bold">Xterm Terminal Demo</h1>
    <p class="text-gray-400">
      Interactive demonstration of the Xterm terminal component
    </p>
  </div>

  <!-- Demo Navigation -->
  <div class="mb-6">
    <div class="mb-4 flex gap-4">
      {#each demoScenarios as scenario, i (i)}
        <button
          class="rounded-md px-4 py-2 transition-colors {currentDemo ===
          scenario.id
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
          onclick={() => switchDemo(scenario.id)}
        >
          {scenario.name}
        </button>
      {/each}
    </div>

    <div class="text-sm text-gray-400">
      {demoScenarios.find((s) => s.id === currentDemo)?.description}
    </div>
  </div>

  <!-- Controls -->
  <div class="mb-6 rounded-lg bg-gray-800 p-4">
    <h3 class="mb-3 text-lg font-semibold">Controls</h3>

    <!-- Theme Selection -->
    <div class="mb-3 flex items-center gap-4">
      <span class="text-sm">Theme:</span>
      {#each Object.keys(themes) as theme, i (i)}
        <button
          class="rounded px-3 py-1 text-xs {currentTheme === theme
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
          onclick={() => changeTheme(theme)}
        >
          {theme.charAt(0).toUpperCase() + theme.slice(1)}
        </button>
      {/each}
    </div>

    <!-- Font Size -->
    <div class="mb-3 flex items-center gap-4">
      <span class="text-sm">Font Size:</span>
      {#each [12, 14, 16, 18] as size, i (i)}
        <button
          class="rounded px-3 py-1 text-xs {fontSize === size
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
          onclick={() => changeFontSize(size)}
        >
          {size}px
        </button>
      {/each}
    </div>

    <!-- Terminal Actions -->
    <div class="flex gap-2">
      {#if currentDemo === "basic" && basicTerminal}
        <button
          class="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
          onclick={() => clearTerminal(basicTerminal)}
        >
          Clear
        </button>
        <button
          class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          onclick={() => resizeTerminal(basicTerminal)}
        >
          Fit
        </button>
      {/if}
    </div>
  </div>

  <!-- Demo Content -->
  <div class="space-y-6">
    {#if currentDemo === "basic"}
      <div class="rounded-lg bg-gray-800 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold">Basic Terminal</h3>
          <div class="flex gap-2">
            {#each demoCommands.basic as command, i (i)}
              <button
                class="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                onclick={() => executeCommand(basicTerminal, command)}
              >
                {command.length > 20
                  ? command.substring(0, 20) + "..."
                  : command}
              </button>
            {/each}
          </div>
        </div>
        <div class="h-80 rounded border border-gray-600">
          <Xterm
            bind:this={basicTerminal}
            createOptions={basicConfig}
            theme={themes[currentTheme]}
            {fontSize}
          />
        </div>
      </div>
    {:else if currentDemo === "repl"}
      <div class="rounded-lg bg-gray-800 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold">Node.js REPL</h3>
          <div class="flex gap-2">
            {#each demoCommands.repl as command, i (i)}
              <button
                class="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                onclick={() => executeCommand(replTerminal, command)}
              >
                {command.length > 15
                  ? command.substring(0, 15) + "..."
                  : command}
              </button>
            {/each}
          </div>
        </div>
        <div class="h-96 rounded border border-gray-600">
          <Xterm
            bind:this={replTerminal}
            createOptions={replConfig}
            theme={themes[currentTheme]}
            {fontSize}
          />
        </div>
      </div>
    {:else if currentDemo === "custom"}
      <div class="rounded-lg bg-gray-800 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold">Custom Terminal</h3>
          <div class="flex gap-2">
            {#each demoCommands.custom as command, i (i)}
              <button
                class="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                onclick={() => executeCommand(customTerminal, command)}
              >
                {command}
              </button>
            {/each}
          </div>
        </div>
        <div class="h-96 rounded border border-gray-600">
          <Xterm
            bind:this={customTerminal}
            createOptions={customConfig}
            theme={themes[currentTheme]}
            fontSize={fontSize + 2}
            fontFamily="'Courier New', monospace"
          />
        </div>
      </div>
    {:else if currentDemo === "multiple"}
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-lg bg-gray-800 p-4">
          <h3 class="mb-3 text-lg font-semibold">Terminal 1 (Bash)</h3>
          <div class="h-64 rounded border border-gray-600">
            <Xterm
              createOptions={{ shell: "/bin/bash", cols: 60, rows: 15 }}
              theme={themes.default}
              fontSize={12}
            />
          </div>
        </div>

        <div class="rounded-lg bg-gray-800 p-4">
          <h3 class="mb-3 text-lg font-semibold">Terminal 2 (Node)</h3>
          <div class="h-64 rounded border border-gray-600">
            <Xterm
              createOptions={{ shell: "node", cols: 60, rows: 15 }}
              theme={themes.green}
              fontSize={12}
            />
          </div>
        </div>

        <div class="rounded-lg bg-gray-800 p-4">
          <h3 class="mb-3 text-lg font-semibold">Terminal 3 (Custom)</h3>
          <div class="h-64 rounded border border-gray-600">
            <Xterm
              createOptions={{
                shell: "/bin/sh",
                cwd: "/tmp",
                cols: 60,
                rows: 15,
              }}
              theme={themes.retro}
              fontSize={12}
            />
          </div>
        </div>

        <div class="rounded-lg bg-gray-800 p-4">
          <h3 class="mb-3 text-lg font-semibold">Terminal 4 (PowerShell)</h3>
          <div class="h-64 rounded border border-gray-600">
            <Xterm
              createOptions={{
                shell:
                  platformInfo?.platform === "win32"
                    ? "powershell.exe"
                    : "/bin/bash",
                cols: 60,
                rows: 15,
              }}
              theme={themes[currentTheme]}
              fontSize={12}
            />
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Info Panel -->
  <div class="mt-8 rounded-lg bg-gray-800 p-4">
    <h3 class="mb-3 text-lg font-semibold">About This Demo</h3>
    <div class="space-y-2 text-sm text-gray-400">
      <p>This demo showcases the Xterm terminal component built with:</p>
      <ul class="ml-4 list-inside list-disc space-y-1">
        <li><strong>@xterm/xterm:</strong> Terminal emulator library</li>
        <li><strong>@xterm/addon-fit:</strong> Auto-fitting terminal size</li>
        <li>
          <strong>XtermService:</strong> Custom service for session management
        </li>
        <li><strong>PtyService:</strong> Backend pseudo-terminal service</li>
        <li><strong>Svelte 5:</strong> Reactive component framework</li>
      </ul>
      <p class="mt-3">Features demonstrated:</p>
      <ul class="ml-4 list-inside list-disc space-y-1">
        <li>Multiple terminal sessions with different shells</li>
        <li>Real-time data streaming and user input handling</li>
        <li>Terminal customization (themes, fonts, sizes)</li>
        <li>Session lifecycle management</li>
        <li>Responsive terminal resizing</li>
        <li>Cross-platform shell support</li>
      </ul>
    </div>
  </div>
</div>
