<!-- src/renderer/src/components/AppXtermStreamMulti.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import XtermStream from "./XtermStream.svelte";
  import {
    ptyStreamManager,
    type PtyStream,
  } from "../services/pty-stream-manager.js";

  let streams = $state<PtyStream[]>([]);
  let selectedSessionId = $state<string | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const refreshStreams = (): void => {
    const nextStreams = ptyStreamManager.getAllStreams();
    streams = nextStreams;

    if (!nextStreams.length) {
      selectedSessionId = null;
      return;
    }

    const hasSelection = nextStreams.some(
      (stream) => stream.ptySessionId === selectedSessionId,
    );

    if (!hasSelection) {
      selectedSessionId = nextStreams[0]?.ptySessionId ?? null;
    }
  };

  const handleSelectChange = (event: Event): void => {
    const selectElement = event.currentTarget as HTMLSelectElement;
    selectedSessionId = selectElement.value;
  };

  const addStream = async (): Promise<void> => {
    try {
      const stream = await ptyStreamManager.createStream({
        shell: "bash",
        cols: 80,
        rows: 24,
      });
      refreshStreams();
      selectedSessionId = stream.ptySessionId;
    } catch (error) {
      console.error("Failed to create stream:", error);
    }
  };

  const removeStream = async (): Promise<void> => {
    if (!selectedSessionId) return;
    const stream = ptyStreamManager.getStream(selectedSessionId);
    if (stream) {
      await stream.destroy();
      refreshStreams();
    }
  };

  onMount(() => {
    refreshStreams();
    refreshTimer = setInterval(() => {
      refreshStreams();
    }, 1000);

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  });
</script>

<div class="flex h-screen w-screen flex-col p-2">
  <div class="mb-2 flex items-center gap-2 text-sm">
    <span>Terminal session:</span>
    <select
      class="rounded-md border px-2 py-1 focus:outline-none"
      onchange={handleSelectChange}
      disabled={!streams.length}
      value={selectedSessionId ?? ""}
    >
      {#if !streams.length}
        <option value="">No streams</option>
      {:else}
        {#each streams as stream, index (stream.ptySessionId)}
          <option value={stream.ptySessionId}>
            Stream {index + 1} · {stream.ptySessionId}
          </option>
        {/each}
      {/if}
    </select>
    <button
      class="rounded-md border px-2 py-1 hover:bg-gray-700"
      onclick={addStream}
    >
      +
    </button>
    <button
      class="rounded-md border px-2 py-1 hover:bg-gray-700 disabled:opacity-50"
      onclick={removeStream}
      disabled={!selectedSessionId}
    >
      -
    </button>
  </div>

  <div class="relative min-h-0 flex-1">
    {#if !streams.length}
      <div class="flex h-full w-full items-center justify-center text-sm">
        No active terminal streams
      </div>
    {:else}
      {#each streams as stream (stream.ptySessionId)}
        <!-- <div
          class="absolute inset-0"
          class:hidden={stream.ptySessionId !== selectedSessionId}
        > -->
        <XtermStream
          {stream}
          hidden={stream.ptySessionId !== selectedSessionId}
        />
        <!-- </div> -->
      {/each}
    {/if}
  </div>
</div>
