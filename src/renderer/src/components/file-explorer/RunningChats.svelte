<!-- src/renderer/src/components/file-explorer/RunningChats.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Logger } from "tslog";
  import {
    ChatDots,
    StopFill,
    ThreeDotsVertical,
  } from "svelte-bootstrap-icons";
  import type { ChatSessionData } from "../../../../core/services/chat/chat-session-repository.js";
  import { apiChatService } from "../../services/api-chat-service.js";
  import { ptyChatService } from "../../services/pty-chat-service.js";
  import { projectService } from "../../services/project-service.js";
  import {
    getRunningChatSessionStates,
    type ChatSessionState,
  } from "../../stores/chat.svelte.js";
  import { getSelectedDocContext } from "../../stores/ui.svelte.js";

  const logger = new Logger({ name: "RunningChats" });

  const runningSessions = $derived.by(getRunningChatSessionStates);
  const activeChatId = $derived.by(
    () => getSelectedDocContext()?.chatSessionState?.data.id ?? null,
  );

  let isLoading = $state(false);
  let loadError: string | null = $state(null);

  onMount(() => {
    async function loadSessions(): Promise<void> {
      isLoading = true;
      loadError = null;

      const results = await Promise.allSettled([
        apiChatService.listSessions(),
        ptyChatService.listSessions(),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          logger.error("Failed to load chat sessions", result.reason);
          loadError =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
        }
      }

      isLoading = false;
    }

    void loadSessions();
  });

  const statusLabels: Record<ChatSessionData["state"], string> = {
    queued: "queued",
    active: "active",
    "active:generating": "generating",
    "active:awaiting_input": "awaiting",
    "active:disconnected": "disconnected",
    terminated: "terminated",
  };

  function getDisplayName(session: ChatSessionData): string {
    if (session.metadata?.title) {
      return session.metadata.title;
    }

    if (session.scriptPath) {
      const parts = session.scriptPath.split(/[/\\]/);
      return parts[parts.length - 1] ?? session.id;
    }

    if (session.sessionType === "pty_chat" && session.metadata?.modelId) {
      const modelParts = session.metadata.modelId.split("/");
      const modelName =
        modelParts[modelParts.length - 1] ?? session.metadata.modelId;
      const shortId = session.id.slice(0, 6);
      return `${modelName} [${shortId}]`;
    }

    if (session.metadata?.external?.workingDirectory) {
      const parts = session.metadata.external.workingDirectory.split(/[/\\]/);
      const dirName = parts[parts.length - 1] ?? session.id;
      const shortId = session.id.slice(0, 6);
      return `${dirName} [${shortId}]`;
    }

    return session.id.slice(0, 12);
  }

  function handleSelect(sessionState: ChatSessionState): void {
    const session = sessionState.data;
    const scriptPath = session.scriptPath;

    if (scriptPath) {
      void projectService.selectFile(scriptPath);
      return;
    }

    logger.warn("No script path available for chat session", {
      chatId: session.id,
      sessionType: session.sessionType,
    });
  }

  function shouldShowStop(session: ChatSessionData): boolean {
    return (
      session.sessionType === "chat_engine" &&
      session.state === "active:generating"
    );
  }

  async function handleStop(
    event: MouseEvent,
    session: ChatSessionData,
  ): Promise<void> {
    event.stopPropagation();
    try {
      await apiChatService.abortSession(session.id);
    } catch (error) {
      logger.error("Failed to stop chat session", {
        chatId: session.id,
        error,
      });
    }
  }

  function getRowClasses(session: ChatSessionData): string {
    const base =
      "hover:bg-hover group relative flex min-h-[24px] cursor-pointer items-center rounded px-1 py-0.5 text-sm transition-colors font-[400]";
    if (session.id === activeChatId) {
      return `bg-selected ${base}`;
    }
    return base;
  }
</script>

<div class="mb-3">
  <div
    class="hover:bg-hover text-muted group flex w-full items-center gap-2 rounded-md px-2 py-1"
    title="Active chats"
  >
    <span class="text-sm font-medium">Active</span>
    <button
      class="text-muted hover:text-accent ml-auto cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
      title="Chat options"
    >
      <ThreeDotsVertical class="text-xs" />
    </button>
  </div>

  <div class="px-2">
    {#if isLoading}
      <div class="text-muted py-2 text-xs">Loading chats…</div>
    {:else if loadError}
      <div class="text-accent py-2 text-xs">Failed to load chats</div>
    {:else if runningSessions.length === 0}
      <div class="text-muted py-2 text-xs">No active chats</div>
    {:else}
      <div class="space-y-0.5">
        {#each runningSessions as sessionState (sessionState.data.id)}
          {@const session = sessionState.data}
          <div
            class={getRowClasses(session)}
            role="button"
            tabindex="0"
            onclick={() => handleSelect(sessionState)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect(sessionState);
              }
            }}
          >
            {#if session.state === "active:awaiting_input"}
              <div class="absolute top-1/2 -left-1 -translate-y-1/2">
                <div
                  class="bg-accent h-1.5 w-1.5 rounded-full"
                  title="Awaiting input"
                ></div>
              </div>
            {/if}
            <ChatDots class="text-muted mr-1.5 text-xs" />
            <span class="max-w-[120px] truncate text-xs">
              {getDisplayName(session)}
            </span>
            <span
              class="border-border text-foreground ml-1 rounded border px-1 py-0.5 font-mono text-[10px]"
            >
              {statusLabels[session.state]}
            </span>
            {#if shouldShowStop(session)}
              <button
                class="text-muted hover:text-accent mr-1 ml-auto cursor-pointer p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                title="Stop chat"
                onclick={(event) => handleStop(event, session)}
              >
                <StopFill class="text-xs" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
