<!-- src/renderer/src/components/Breadcrumb.svelte -->
<script lang="ts">
  import {
    ChevronRight,
    StopFill,
    ArrowClockwise,
    ThreeDots,
    XCircle,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { projectState } from "../stores/project-store.svelte.js";
  import { getChatSessionByPromptScriptPath } from "../stores/ui.svelte.js";
  import { uiState } from "../stores/ui-store.svelte.js";
  import { ptyChatService } from "../services/pty-chat-service.js";
  import type { ChatState } from "../../../core/services/chat/chat-session-repository.js";

  const logger = new Logger({ name: "Breadcrumb" });

  interface Props {
    filePath: string;
    modelInfo?: string;
    hasUnsavedChanges?: boolean;
  }

  let { filePath, modelInfo, hasUnsavedChanges }: Props = $props();

  const isPromptScript = $derived(filePath && filePath.endsWith(".prompt.md"));
  const linkedChatSession = $derived(
    isPromptScript ? getChatSessionByPromptScriptPath(filePath) : null,
  );
  const chatState: ChatState | undefined = $derived(
    linkedChatSession?.data.state,
  );

  const isLoadingStopChat = $derived(
    uiState.loadingStates["stopChat"] || false,
  );
  const isLoadingRunChat = $derived(uiState.loadingStates["runChat"] || false);
  const isLoadingTerminateChat = $derived(
    uiState.loadingStates["terminateChat"] || false,
  );

  const breadcrumb = $derived.by(() => {
    if (!filePath) return null;

    const pathParts = filePath.split("/").filter((part) => part);
    const fileName = pathParts.pop() || "";

    const containingProject = projectState.projectFolders.find((project) =>
      filePath.startsWith(project.path),
    );

    let segments: string[];

    if (containingProject) {
      const projectPathParts = containingProject.path
        .split("/")
        .filter((part) => part);
      const relativeParts = pathParts.slice(projectPathParts.length);
      segments = [containingProject.name, ...relativeParts];
    } else {
      segments = pathParts;
    }

    const displayFileName = hasUnsavedChanges ? `${fileName}*` : fileName;

    return {
      segments,
      displayFileName,
    };
  });

  function getChatStatusConfig(state: ChatState): { label: string | null } {
    switch (state) {
      case "active:generating":
        return { label: "generating" };
      case "active:awaiting_input":
        return { label: "awaiting" };
      case "queued":
        return { label: "queued" };
      case "active":
        return { label: "active" };
      case "active:disconnected":
        return { label: "disconnected" };
      case "terminated":
      default:
        return { label: null };
    }
  }

  async function handleRunChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript) return;
    // TODO: Implement run chat functionality
  }

  async function handleStopChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript) return;
    // TODO: Implement stop chat functionality
  }

  async function handleTerminateChat(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!isPromptScript || !linkedChatSession) return;

    if (linkedChatSession.data.sessionType !== "pty_chat") {
      logger.warn("Cannot terminate non-PTY chat session with snapshot");
      return;
    }

    const confirmed = confirm(
      "Terminate session? This will end the session and save a final snapshot.",
    );
    if (!confirmed) return;

    try {
      await ptyChatService.terminateSessionWithSnapshot(
        linkedChatSession.data.id,
      );
      logger.info(`Session ${linkedChatSession.data.id} terminated`);
    } catch (error) {
      logger.error("Failed to terminate session", error);
      alert("Failed to terminate session. Please try again.");
    }
  }
</script>

{#if breadcrumb}
  <div class="flex items-center gap-2">
    {#each breadcrumb.segments as segment, i (i)}
      <span class="text-muted text-xs">{segment}</span>
      <ChevronRight class="text-muted text-xs" />
    {/each}
    <span class="text-foreground text-xs">{breadcrumb.displayFileName}</span>

    {#if isPromptScript}
      <div class="flex items-center gap-1">
        {#if chatState}
          {@const statusConfig = getChatStatusConfig(chatState)}
          {#if statusConfig.label}
            <span
              class="border-border text-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]"
            >
              {statusConfig.label}
            </span>
          {/if}
        {/if}

        {#if chatState === "active:generating"}
          <button
            onclick={handleStopChat}
            disabled={isLoadingStopChat}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Stop"
          >
            <StopFill />
          </button>
        {/if}

        <button
          onclick={handleRunChat}
          disabled={isLoadingRunChat}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Rerun"
        >
          <ArrowClockwise />
        </button>

        {#if chatState && chatState !== "terminated"}
          <button
            onclick={handleTerminateChat}
            disabled={isLoadingTerminateChat}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Terminate"
          >
            <XCircle />
          </button>
        {/if}

        <button
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="More"
        >
          <ThreeDots />
        </button>
      </div>
    {:else if modelInfo}
      <span class="text-muted text-xs">[{modelInfo}]</span>
    {/if}
  </div>
{/if}
