<!-- apps/my-app-svelte/src/components/UserSettings.svelte -->
<script lang="ts">
  import { userSettingsState } from "../stores/user-settings-store.svelte.js";
  import { userSettingsService } from "../services/user-settings-service.js";
  import { projectState } from "../stores/project-store.svelte.js";
  import { projectService } from "../services/project-service.js";
  import { onMount } from "svelte";
  import { Gear, X, Plus, Trash, Pencil } from "svelte-bootstrap-icons";

  let {
    showSettings = false,
    onClose,
  }: { showSettings?: boolean; onClose?: () => void } = $props();

  let newProjectFolder = $state("");
  let showAddProjectFolder = $state(false);

  let providers = $state({
    openai: { enabled: true, apiKey: "" },
    anthropic: { enabled: true, apiKey: "" },
    google: { enabled: false, apiKey: "" },
  });

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

  onMount(() => {
    userSettingsService.loadSettings();
  });

  function toggleSettings() {
    if (onClose) {
      onClose();
    }
  }

  function toggleAddProjectFolder() {
    showAddProjectFolder = !showAddProjectFolder;
    if (!showAddProjectFolder) {
      newProjectFolder = "";
    }
  }

  async function addProjectFolder() {
    if (!newProjectFolder.trim()) return;

    try {
      await projectService.addProjectFolder(newProjectFolder.trim());
      newProjectFolder = "";
      showAddProjectFolder = false;
    } catch (error) {
      console.error("Failed to add project folder:", error);
    }
  }

  async function removeProjectFolder(folderId: string) {
    try {
      await projectService.removeProjectFolder(folderId);
    } catch (error) {
      console.error("Failed to remove project folder:", error);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      addProjectFolder();
    } else if (event.key === "Escape") {
      showAddProjectFolder = false;
      newProjectFolder = "";
    }
  }

  function toggleProvider(providerKey: string) {
    providers[providerKey].enabled = !providers[providerKey].enabled;
  }

  function toggleMcpServer(serverId: string) {
    const server = mcpServers.find((s) => s.id === serverId);
    if (server) {
      server.enabled = !server.enabled;
    }
  }
</script>

<button
  onclick={toggleSettings}
  class="p-2 text-gray-400 hover:text-gray-300 transition-colors"
  title="User Settings"
  aria-label="Open settings"
>
  <Gear class="w-5 h-5" />
</button>

{#if showSettings}
  <div class="fixed inset-0 z-50 bg-black bg-opacity-50">
    <div class="bg-background text-foreground h-screen overflow-hidden">
      <!-- Header -->
      <header
        class="bg-surface border-b border-border flex h-12 shrink-0 items-center gap-2 px-4"
      >
        <Gear class="w-5 h-5 text-muted" />
        <span class="font-semibold">Settings</span>
        <div class="flex-1"></div>
        <button
          onclick={toggleSettings}
          class="text-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close settings"
        >
          <X class="w-6 h-6" />
        </button>
      </header>

      <!-- Settings Content -->
      <div class="overflow-y-auto p-6" style="height: calc(100vh - 48px);">
        <div class="mx-auto max-w-3xl space-y-10">
          {#if userSettingsState.loading}
            <div class="text-center py-4">
              <div
                class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto"
              ></div>
              <p class="mt-2 text-sm text-muted">Loading settings...</p>
            </div>
          {:else}
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
                    <Plus class="inline w-3 h-3 mr-1" />
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
                        class="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onclick={toggleAddProjectFolder}
                        class="px-3 py-1 bg-border text-foreground text-sm rounded-md hover:bg-selected transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                {/if}

                <ul class="divide-border divide-y">
                  {#each projectState.projectFolders as folder}
                    <li class="flex items-center justify-between px-3 py-2">
                      <p class="font-mono text-sm">{folder.path}</p>
                      <button
                        onclick={() => removeProjectFolder(folder.id)}
                        class="text-muted hover:text-red-500 cursor-pointer"
                        title="Remove"
                        aria-label="Remove folder"
                      >
                        <Trash class="w-4 h-4" />
                      </button>
                    </li>
                  {/each}

                  {#if projectState.projectFolders.length === 0}
                    <li class="px-3 py-2">
                      <p class="text-sm text-muted italic">
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
              <div
                class="border-border mt-4 overflow-hidden rounded-lg border"
              >
                <table class="w-full">
                  <thead class="bg-surface/50">
                    <tr>
                      <th
                        class="text-muted w-1/4 p-3 text-left text-xs font-semibold uppercase"
                        >Provider</th
                      >
                      <th
                        class="text-muted w-2/4 p-3 text-left text-xs font-semibold uppercase"
                        >API Key</th
                      >
                      <th
                        class="text-muted w-1/4 p-3 text-left text-xs font-semibold uppercase"
                        >Enabled</th
                      >
                    </tr>
                  </thead>
                  <tbody class="divide-border divide-y">
                    <tr class="hover:bg-hover">
                      <td class="p-3 font-medium">OpenAI</td>
                      <td class="p-3">
                        <input
                          type="password"
                          bind:value={providers.openai.apiKey}
                          placeholder="Enter your OpenAI API key"
                          class="bg-input-background border-input-border focus:border-accent w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
                        />
                      </td>
                      <td class="p-3">
                        <input
                          type="checkbox"
                          bind:checked={providers.openai.enabled}
                          class="w-4 h-4"
                        />
                      </td>
                    </tr>
                    <tr class="hover:bg-hover">
                      <td class="p-3 font-medium">Anthropic</td>
                      <td class="p-3">
                        <input
                          type="password"
                          bind:value={providers.anthropic.apiKey}
                          placeholder="Enter your Anthropic API key"
                          class="bg-input-background border-input-border focus:border-accent w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
                        />
                      </td>
                      <td class="p-3">
                        <input
                          type="checkbox"
                          bind:checked={providers.anthropic.enabled}
                          class="w-4 h-4"
                        />
                      </td>
                    </tr>
                    <tr class="hover:bg-hover">
                      <td class="p-3 font-medium">Google</td>
                      <td class="p-3">
                        <input
                          type="password"
                          bind:value={providers.google.apiKey}
                          placeholder="Enter your Google API key"
                          class="bg-input-background border-input-border focus:border-accent w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
                        />
                      </td>
                      <td class="p-3">
                        <input
                          type="checkbox"
                          bind:checked={providers.google.enabled}
                          class="w-4 h-4"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
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
                    <Plus class="inline w-3 h-3 mr-1" />
                    Add Server
                  </button>
                </div>
                <ul class="divide-border divide-y">
                  {#each mcpServers as server}
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
                          <Pencil class="w-4 h-4" />
                        </button>
                        <button
                          class="text-muted hover:text-red-500 cursor-pointer"
                          title="Remove"
                          aria-label="Remove server"
                        >
                          <Trash class="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            </section>
          {/if}

          {#if userSettingsState.error}
            <div class="p-3 bg-red-600/10 border border-red-600/20 rounded-md">
              <p class="text-sm text-red-400">{userSettingsState.error}</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

