<!-- src/renderer/src/components/UserSettings.svelte -->
<script lang="ts">
  import { Gear, X, Plus, Trash, Pencil } from "svelte-bootstrap-icons";
  import { projectService } from "../services/project-service.js";
  import { userSettingsService } from "../services/user-settings-service.js";
  import { projectState } from "../stores/project-store.svelte.js";
  import { userSettingsState } from "../stores/user-settings-store.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import ProviderApiKeyRow from "./ProviderApiKeyRow.svelte";

  let newProjectFolder = $state("");
  let showAddProjectFolder = $state(false);

  let mcpServers = $state([
    {
      id: "1",
      name: "GitHub MCP",
      url: "http://localhost:3001",
      enabled: true,
    },
    {
      id: "2",
      name: "Jira MCP",
      url: "https://mcp.internal.corp/jira",
      enabled: false,
    },
  ]);

  $effect(() => {
    userSettingsService.loadSettings();
  });

  function closeSettings(): void {
    ui.settingsPanelOpen = false;
  }

  function toggleAddProjectFolder(): void {
    showAddProjectFolder = !showAddProjectFolder;
    if (!showAddProjectFolder) {
      newProjectFolder = "";
    }
  }

  async function addProjectFolder(): Promise<void> {
    if (!newProjectFolder.trim()) return;

    await projectService.addProjectFolder(newProjectFolder.trim());
    newProjectFolder = "";
    showAddProjectFolder = false;
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      addProjectFolder();
    } else if (event.key === "Escape") {
      showAddProjectFolder = false;
      newProjectFolder = "";
    }
  }
</script>

<div class="flex h-full w-screen flex-col">
  <!-- Header -->
  <header class="flex h-12 shrink-0 items-center gap-2 px-4">
    <Gear class="text-muted h-5 w-5" />
    <span class="font-semibold">Settings</span>
    <div class="flex-1"></div>
    <button
      onclick={closeSettings}
      class="text-muted hover:text-foreground cursor-pointer transition-colors"
      aria-label="Close settings"
    >
      <X class="h-6 w-6" />
    </button>
  </header>

      <!-- Settings Content -->
      <div class="scrollbar-thin flex-1 overflow-y-auto">
        <div class="mx-auto max-w-3xl space-y-10 p-4 lg:p-6">
          {#if userSettingsState.loading}
            <div class="py-4 text-center">
              <div
                class="border-accent mx-auto h-8 w-8 animate-spin rounded-full border-b-2"
              ></div>
              <p class="text-muted mt-2 text-sm">Loading settings...</p>
            </div>
          {:else}
            <!-- COMMENTED OUT: Workspace Directory Section - Feature not needed -->
            <!-- Users can add existing folders instead -->

            <!-- Project Management Section -->
            <section>
              <h2 class="text-lg font-semibold">Project Management</h2>
              <p class="text-muted mt-1 text-sm">
                Manage the project folders the application has access to.
              </p>
              <div class="border-border mt-4 rounded-lg border">
                <div
                  class="border-border flex items-center justify-between border-b p-3"
                >
                  <h3 class="text-sm font-medium">Project Folders</h3>
                  <button
                    onclick={toggleAddProjectFolder}
                    class="bg-surface hover:bg-hover border-border text-foreground cursor-pointer rounded-md border px-3 py-1 text-sm font-medium"
                  >
                    <Plus class="mr-1 inline h-3 w-3" />
                    Add Folder
                  </button>
                </div>

                {#if showAddProjectFolder}
                  <div class="border-border border-b p-3">
                    <div class="flex gap-2">
                      <input
                        bind:value={newProjectFolder}
                        onkeydown={handleKeyDown}
                        type="text"
                        placeholder="Enter project folder path..."
                        class="bg-input-background border-input-border focus:border-accent flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none"
                      />
                      <button
                        onclick={addProjectFolder}
                        disabled={!newProjectFolder.trim()}
                        class="rounded-md bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onclick={toggleAddProjectFolder}
                        class="bg-border text-foreground hover:bg-selected rounded-md px-3 py-1 text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                {/if}

                <ul class="divide-border divide-y">
                  {#each projectState.projectFolders as folder (folder.path)}
                    <li class="flex items-center justify-between px-3 py-2">
                      <p class="font-mono text-sm">{folder.path}</p>
                      <button
                        onclick={() =>
                          projectService.removeProjectFolder(folder.path)}
                        class="text-muted cursor-pointer hover:text-red-500"
                        title="Remove"
                        aria-label="Remove folder"
                      >
                        <Trash class="h-4 w-4" />
                      </button>
                    </li>
                  {/each}

                  {#if projectState.projectFolders.length === 0}
                    <li class="px-3 py-2">
                      <p class="text-muted text-sm italic">
                        No project folders added
                      </p>
                    </li>
                  {/if}
                </ul>
              </div>
            </section>

            <!-- AI Providers Section -->
            <section>
              <h2 class="text-lg font-semibold">AI Providers</h2>
              <p class="text-muted mt-1 text-sm">
                Configure API keys for the AI models you want to use.
              </p>
              <div class="border-border mt-4 rounded-lg border">
                <div
                  class="border-border flex items-center justify-between border-b p-3"
                >
                  <h3 class="text-sm font-medium">Configured Providers</h3>
                </div>
                <ul class="divide-border divide-y">
                  <ProviderApiKeyRow
                    provider="aigateway"
                    displayName="AI Gateway"
                    apiKey={userSettingsState.settings?.providers?.aigateway
                      ?.apiKey}
                    enabled={userSettingsState.settings?.providers?.aigateway
                      ?.enabled || false}
                  />
                  <ProviderApiKeyRow
                    provider="openrouter"
                    displayName="OpenRouter"
                    apiKey={userSettingsState.settings?.providers?.openrouter
                      ?.apiKey}
                    enabled={userSettingsState.settings?.providers?.openrouter
                      ?.enabled || false}
                  />
                  <!-- <ProviderApiKeyRow
                    provider="anthropic"
                    displayName="Anthropic"
                    apiKey={userSettingsState.settings?.providers?.anthropic
                      ?.apiKey}
                    enabled={userSettingsState.settings?.providers?.anthropic
                      ?.enabled || false}
                  />
                  <ProviderApiKeyRow
                    provider="google"
                    displayName="Google"
                    apiKey={userSettingsState.settings?.providers?.google
                      ?.apiKey}
                    enabled={userSettingsState.settings?.providers?.google
                      ?.enabled || false}
                  /> -->
                </ul>
              </div>
            </section>

            <!-- MCP Servers Section -->
            <section>
              <h2 class="text-lg font-semibold">MCP Servers</h2>
              <p class="text-muted mt-1 text-sm">
                Manage external tool servers using the Model Context Protocol.
              </p>
              <div class="border-border mt-4 rounded-lg border">
                <div
                  class="border-border flex items-center justify-between border-b p-3"
                >
                  <h3 class="text-sm font-medium">Configured Servers</h3>
                  <button
                    class="bg-surface hover:bg-hover border-border text-foreground cursor-pointer rounded-md border px-3 py-1 text-sm font-medium"
                  >
                    <Plus class="mr-1 inline h-3 w-3" />
                    Add Server
                  </button>
                </div>
                <ul class="divide-border divide-y">
                  {#each mcpServers as server (server.id)}
                    <li class="flex items-center justify-between px-3 py-2">
                      <div>
                        <p class="font-medium">{server.name}</p>
                        <p class="text-muted font-mono text-xs">
                          {server.url}
                        </p>
                      </div>
                      <div class="flex items-center gap-4">
                        {#if server.enabled}
                          <span
                            class="rounded border border-blue-600/40 bg-blue-600/20 px-1.5 py-0.5 text-xs text-blue-400"
                            >Enabled</span
                          >
                        {:else}
                          <span
                            class="rounded border border-gray-600/40 bg-gray-600/20 px-1.5 py-0.5 text-xs text-gray-400"
                            >Disabled</span
                          >
                        {/if}
                        <button
                          class="text-muted hover:text-accent cursor-pointer"
                          title="Edit"
                          aria-label="Edit server"
                        >
                          <Pencil class="h-4 w-4" />
                        </button>
                        <button
                          class="text-muted cursor-pointer hover:text-red-500"
                          title="Remove"
                          aria-label="Remove server"
                        >
                          <Trash class="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            </section>
          {/if}

          {#if userSettingsState.error}
            <div class="rounded-md border border-red-600/20 bg-red-600/10 p-3">
              <p class="text-sm text-red-400">{userSettingsState.error}</p>
            </div>
          {/if}
        </div>
      </div>
</div>
