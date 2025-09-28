<!-- src/renderer/src/components/AppXtermMulti.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";

  let terminals = $state<string[]>([]);
  let selectedId = $state<string | null>(null);
  let nextIndex = $state(1);

  const addTerminal = (): void => {
    const id = `#${nextIndex}`;
    nextIndex = nextIndex + 1;
    terminals = [...terminals, id];
    selectedId = id;
  };

  const removeSelected = (): void => {
    if (selectedId === null) return;

    const updated = terminals.filter((id) => id !== selectedId);
    terminals = updated;
    selectedId = updated.length > 0 ? updated[updated.length - 1] : null;
  };

  const selectTerminal = (id: string): void => {
    selectedId = id;
  };
</script>

<!-- Minimal dynamic xterm demo -->
<div class="flex h-screen w-screen flex-col gap-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <button
        class="rounded-md border px-3 py-1 text-sm transition"
        onclick={addTerminal}
      >
        Add terminal
      </button>
      <button
        class="borde rounded-md border px-3 py-1 text-sm"
        disabled={selectedId === null}
        onclick={removeSelected}
      >
        Remove selected
      </button>
    </div>

    {#if terminals.length > 0}
      <div class="flex items-center gap-2 text-sm">
        {#each terminals as id (id)}
          <button
            class="rounded-md px-2 py-1 text-xs transition"
            class:border={selectedId === id}
            onclick={() => selectTerminal(id)}
          >
            {id}
          </button>
        {/each}
        {#if selectedId}
          <span>Selected: {selectedId}</span>
        {:else}
          <span>Select a terminal</span>
        {/if}
      </div>
    {:else}
      <div class="text-sm">No terminals yet</div>
    {/if}
  </div>

  <div class="min-h-0 flex-1 rounded-md border p-2">
    {#if terminals.length === 0}
      <div class="flex h-full items-center justify-center text-sm">
        Click "Add terminal" to create a new session.
      </div>
    {:else}
      {#each terminals as id (id)}
        <Xterm hidden={selectedId !== id} />
      {/each}
    {/if}
  </div>
</div>
