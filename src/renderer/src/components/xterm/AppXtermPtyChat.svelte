<!-- src/renderer/src/components/AppXtermPtyChat.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import XtermStream from "./XtermStream.svelte";
  import { ptyChatService } from "../services/pty-chat-service.js";
  import {
    ptyStreamManager,
    type PtyStream,
  } from "../services/pty-stream-manager.js";
  import type { ChatSessionData } from "../../../core/services/chat-engine/chat-session-repository.js";

  let streams = $state<PtyStream[]>([]);
  let ptyChats = $state<ChatSessionData[]>([]);
  let selectedPtyChatId = $state<string | null>(null);

  const selectedPtySessionId = $derived.by(() => {
    if (!selectedPtyChatId) return null;

    const selectedChat = ptyChats.find((chat) => chat.id === selectedPtyChatId);
    const ptyInstanceId = selectedChat?.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      const stram = ptyStreamManager.getStream(ptyInstanceId);
      return stram?.ptySessionId ?? null;
    }
    return null;
  });

  const refreshStreams = (): void => {
    const nextStreams = ptyStreamManager.getAllStreams();
    streams = nextStreams;

    if (!ptyChats.length) {
      selectedPtyChatId = null;
      return;
    }

    const hasSelection = ptyChats.some((chat) => chat.id === selectedPtyChatId);

    if (!hasSelection) {
      selectedPtyChatId = ptyChats[0]?.id ?? null;
    }
  };

  const handleSelectChange = (event: Event): void => {
    const selectElement = event.currentTarget as HTMLSelectElement;
    selectedPtyChatId = selectElement.value;
  };

  const createPtyChat = async (): Promise<void> => {
    const targetDirectory = "/Users/cw/Documents/GitHub/electron-app/tmp";
    const modelId: `${string}/${string}` = "cli/claude";

    const ptyChat = await ptyChatService.createSession(
      targetDirectory,
      modelId,
      "Starting new PTY chat session",
    );

    const ptyInstanceId = ptyChat.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      ptyStreamManager.getOrAttachStream(ptyInstanceId);
      ptyChats.push(ptyChat);
      refreshStreams();
      selectedPtyChatId = ptyChat.id;
    } else {
      throw new Error("No PTY instance ID found in metadata");
    }
  };

  const terminateSession = async (): Promise<void> => {
    if (!selectedPtyChatId) return;
    const selectedChat = ptyChats.find((chat) => chat.id === selectedPtyChatId);
    const ptyInstanceId = selectedChat?.metadata?.external?.pty?.ptyInstanceId;
    if (ptyInstanceId) {
      await ptyStreamManager.disposeStream(ptyInstanceId);
      refreshStreams();
    }
  };

  onMount(() => {
    refreshStreams();
  });
</script>

<div class="flex h-screen w-screen flex-col p-2">
  <div class="mb-2 flex items-center gap-2 text-sm">
    <span>PTY Chat session:</span>
    <select
      class="rounded-md border px-2 py-1 focus:outline-none"
      onchange={handleSelectChange}
      disabled={!ptyChats.length}
      value={selectedPtyChatId ?? ""}
    >
      {#if !ptyChats.length}
        <option value="">No PTY chats</option>
      {:else}
        {#each ptyChats as chat, index (chat.id)}
          <option value={chat.id}>
            PTY Chat {index + 1} · {chat.id}
          </option>
        {/each}
      {/if}
    </select>
    <button
      class="rounded-md border px-2 py-1 hover:bg-gray-700"
      onclick={createPtyChat}
    >
      +
    </button>
    <button
      class="rounded-md border px-2 py-1 hover:bg-gray-700 disabled:opacity-50"
      onclick={terminateSession}
      disabled={!selectedPtyChatId}
      title="Terminate PTY session (keeps chat)"
    >
      Terminate
    </button>
  </div>

  <div class="relative min-h-0 flex-1">
    {#if !ptyChats.length}
      <div class="flex h-full w-full items-center justify-center text-sm">
        No PTY chats
      </div>
    {:else if selectedPtyChatId && !selectedPtySessionId}
      <div class="flex h-full w-full items-center justify-center text-sm">
        PTY session terminated
      </div>
    {/if}

    {#each streams as stream (stream.ptySessionId)}
      <!-- <div
          class="absolute inset-0"
          class:hidden={stream.ptySessionId !== selectedPtySessionId}
        > -->
      <XtermStream
        ptyStream={stream}
        hidden={stream.ptySessionId !== selectedPtySessionId}
      />
      <!-- </div> -->
    {/each}
  </div>
</div>
