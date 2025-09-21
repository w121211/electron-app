<!-- src/renderer/src/components/ProviderApiKeyRow.svelte -->
<script lang="ts">
  import { Pencil, Trash } from "svelte-bootstrap-icons";
  import { userSettingsService } from "../services/user-settings-service.js";
  import {
    showSuccessToast,
    showErrorToast,
  } from "../stores/ui-store.svelte.js";

  let {
    provider,
    displayName,
    apiKey,
    enabled = false,
    onApiKeyChange,
  }: {
    provider: string;
    displayName: string;
    apiKey?: string;
    enabled?: boolean;
    onApiKeyChange?: (
      provider: string,
      apiKey: string,
      enabled: boolean,
    ) => void;
  } = $props();

  let isEditing = $state(false);
  let newApiKey = $state("");

  async function saveProviderApiKey(
    providerKey: string,
    key: string,
    isEnabled = true,
  ): Promise<void> {
    if (!key.trim()) return;

    try {
      await userSettingsService.setProviderApiKey(
        providerKey,
        key.trim(),
        isEnabled,
      );
      showSuccessToast(`${displayName} API key saved successfully`);
      onApiKeyChange?.(providerKey, key.trim(), isEnabled);
    } catch (error) {
      showErrorToast(
        `Failed to save API key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  function startEditing(): void {
    isEditing = true;
    newApiKey = "";
  }

  function cancelEditing(): void {
    isEditing = false;
    newApiKey = "";
  }

  async function saveApiKey(): Promise<void> {
    if (newApiKey.trim()) {
      await saveProviderApiKey(provider, newApiKey.trim(), enabled);
      isEditing = false;
      newApiKey = "";
    }
  }

  async function removeApiKey(): Promise<void> {
    try {
      await userSettingsService.clearProviderApiKey(provider);
      showSuccessToast(`${displayName} API key removed`);
      onApiKeyChange?.(provider, "", false);
    } catch (error) {
      showErrorToast(
        `Failed to remove API key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      saveApiKey();
    } else if (event.key === "Escape") {
      cancelEditing();
    }
  }

  async function toggleEnabled(): Promise<void> {
    if (apiKey) {
      await saveProviderApiKey(provider, apiKey, !enabled);
    }
  }
</script>

<li class="flex items-center justify-between px-3 py-2">
  <div class="flex flex-1 items-center gap-3">
    <span class="min-w-0 font-medium">{displayName}</span>
    {#if isEditing}
      <div class="flex flex-1 gap-2">
        <input
          bind:value={newApiKey}
          onkeydown={handleKeyDown}
          type="password"
          placeholder="Enter API key"
          class="bg-input-background border-input-border focus:border-accent flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none"
        />
        <button
          onclick={saveApiKey}
          class="bg-surface hover:bg-hover border-border text-foreground cursor-pointer rounded-md border px-3 py-1 text-sm font-medium"
        >
          Save
        </button>
        <button
          onclick={cancelEditing}
          class="bg-border text-foreground hover:bg-selected cursor-pointer rounded-md px-3 py-1 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    {:else if apiKey}
      <span class="text-muted font-mono text-sm">••••••••••••••••</span>
    {/if}
  </div>
  {#if !isEditing}
    <div class="flex items-center gap-4">
      <button onclick={toggleEnabled} class="cursor-pointer">
        <span
          class={enabled
            ? "rounded border border-blue-600/40 bg-blue-600/20 px-1.5 py-0.5 text-xs text-blue-400"
            : "rounded border border-gray-600/40 bg-gray-600/20 px-1.5 py-0.5 text-xs text-gray-400"}
          >Enabled</span
        >
      </button>
      <button
        onclick={startEditing}
        class="text-muted hover:text-accent cursor-pointer"
        title="Edit"
        aria-label="Edit API key"
      >
        <Pencil class="h-4 w-4" />
      </button>
      <button
        onclick={removeApiKey}
        class="text-muted cursor-pointer hover:text-red-500"
        title="Remove"
        aria-label="Remove API key"
      >
        <Trash class="h-4 w-4" />
      </button>
    </div>
  {/if}
</li>
