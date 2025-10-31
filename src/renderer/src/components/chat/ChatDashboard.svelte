<!-- src/renderer/src/components/chat/ChatDashboard.svelte -->
<script lang="ts">
  import {
    Stars,
    PersonRaisedHand,
    MoonFill,
    Folder,
    Cpu,
    Clock,
    Pencil,
    StopFill,
    Terminal,
    PlayFill,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import type {
    ChatSessionData,
    ChatState,
  } from "../../../../core/services/chat/chat-session-repository.js";
  import { showToast } from "../../stores/ui-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import {
    chatSessions,
    setChatSession,
    type ChatSessionState,
  } from "../../stores/chat.svelte.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import {
    quickLauncherService,
    type PromptEditSummary,
  } from "../../services/quick-launcher-service.js";
  import NavigationButtonsNew from "../NavigationButtonsNew.svelte";
  import { apiChatService } from "../../services/api-chat-service.js";
  import { ptyChatService } from "../../services/pty-chat-service.js";

  type TabKey = "active" | "queued" | "terminated";

  const logger = new Logger({ name: "ChatDashboard" });

  let selectedTab = $state<TabKey>("active");
  let hasLoadedPrompts = $state(false);
  let lastProjectFolderKey = $state<string | null>(null);
  let hasLoadedSessions = $state(false);
  let recentPromptEdits = $state<PromptEditSummary[]>([]);
  let isLoadingRecentPromptEdits = $state(false);

  const sessionStates = $derived(
    Object.values(chatSessions) as ChatSessionState[],
  );

  const sortedSessions = $derived(
    sessionStates
      .map((state) => state.data)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
  );

  const isActiveState = (state: ChatState): boolean =>
    state === "active" ||
    state === "active:generating" ||
    state === "active:awaiting_input" ||
    state === "active:disconnected";

  const tabCounts = $derived(() => {
    let active = 0;
    let queued = 0;
    let terminated = 0;

    for (const session of sortedSessions) {
      if (session.state === "queued") {
        queued += 1;
      } else if (session.state === "terminated") {
        terminated += 1;
      } else if (isActiveState(session.state)) {
        active += 1;
      }
    }

    return { active, queued, terminated } satisfies Record<TabKey, number>;
  });

  const visibleSessions = $derived(() => {
    if (selectedTab === "active") {
      return sortedSessions.filter((session) => isActiveState(session.state));
    }

    if (selectedTab === "queued") {
      return sortedSessions.filter((session) => session.state === "queued");
    }

    return sortedSessions.filter((session) => session.state === "terminated");
  });

  const recentPromptsLimit = 6;
  const recentPrompts = $derived(
    recentPromptEdits.slice(0, recentPromptsLimit),
  );

  $effect(() => {
    const projectFolderKey = projectState.projectFolders
      .map((folder) => folder.path)
      .sort()
      .join("|");

    if (!hasLoadedPrompts || projectFolderKey !== lastProjectFolderKey) {
      hasLoadedPrompts = true;
      lastProjectFolderKey = projectFolderKey;
      void quickLauncherService.loadRecentPromptScripts();
      void loadRecentPromptEdits();
    }
  });

  async function loadChatSessions(): Promise<void> {
    const results = await Promise.allSettled([
      apiChatService.listSessions(),
      ptyChatService.listSessions(),
    ]);

    let hadError = false;
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error("Failed to load chat sessions", result.reason);
        hadError = true;
      }
    }

    if (hadError) {
      showToast("Failed to load some chat sessions", "error");
    }
  }

  async function loadRecentPromptEdits(): Promise<void> {
    try {
      isLoadingRecentPromptEdits = true;
      const summaries = await quickLauncherService.fetchRecentPromptEdits(24);
      recentPromptEdits = summaries
        .slice()
        .sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        );
    } catch (error) {
      logger.error("Failed to load recent prompt edits", error);
      recentPromptEdits = [];
    } finally {
      isLoadingRecentPromptEdits = false;
    }
  }

  async function handlePromptEditSelect(entry: PromptEditSummary): Promise<void> {
    if (entry.scriptPath) {
      try {
        await projectService.selectFile(entry.scriptPath);
      } catch (error) {
        logger.error("Failed to open prompt script", error);
        showToast("Failed to open prompt script", "error");
      }
      return;
    }

    try {
      await window.api.quickPromptWindow.show();
    } catch (error) {
      logger.error("Failed to open quick prompt window", error);
      showToast("Failed to open quick prompt window", "error");
    }
  }

  $effect(() => {
    if (!hasLoadedSessions) {
      hasLoadedSessions = true;
      void loadChatSessions();
    }
  });

  const stateLabels: Record<ChatState, string> = {
    queued: "Queued",
    active: "Idle",
    "active:generating": "Generating",
    "active:awaiting_input": "Awaiting Input",
    "active:disconnected": "Disconnected",
    terminated: "Terminated",
  };

  function formatRelativeTime(timestamp: Date | string): string {
    const target = new Date(timestamp);
    if (Number.isNaN(target.getTime())) {
      return "";
    }

    const diffMs = Date.now() - target.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks}w ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}y ago`;
  }

  function getProjectName(session: ChatSessionData): string | null {
    const projectPath = session.metadata?.projectPath ?? session.scriptPath;
    if (!projectPath) return null;
    const parts = projectPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? (parts[parts.length - 1] ?? null) : null;
  }

  function getModelLabel(session: ChatSessionData): string | null {
    const modelId = session.metadata?.modelId;
    if (!modelId) return null;
    const segments = modelId.split("/");
    return segments[segments.length - 1] ?? modelId;
  }

  function selectTab(tab: TabKey): void {
    selectedTab = tab;
  }

  function handleTerminate(session: ChatSessionData): void {
    const updated: ChatSessionData = {
      ...session,
      state: "terminated",
      updatedAt: new Date(),
    };
    setChatSession(updated);
    logger.debug("Marked session as terminated", { sessionId: session.id });
  }

  function handleResume(session: ChatSessionData): void {
    const updated: ChatSessionData = {
      ...session,
      state: "active:generating",
      updatedAt: new Date(),
    };
    setChatSession(updated);
    logger.debug("Resuming session", { sessionId: session.id });
  }

  async function handleEditPrompt(session: ChatSessionData): Promise<void> {
    const scriptPath = session.scriptPath;
    if (!scriptPath) {
      showToast("No prompt script linked to this chat", "warning");
      return;
    }

    try {
      await projectService.selectFile(scriptPath);
    } catch (error) {
      logger.error("Failed to open prompt script", error);
      showToast("Failed to open prompt script", "error");
    }
  }

  type StatusIcon = typeof Stars | typeof PersonRaisedHand | typeof MoonFill;

  function getStatusIcon(session: ChatSessionData): StatusIcon {
    if (session.state === "active:generating") {
      return Stars;
    }

    if (session.state === "active:awaiting_input") {
      return PersonRaisedHand;
    }

    return MoonFill;
  }

  function getStatusIconClass(session: ChatSessionData): string {
    if (session.state === "active:generating") {
      return "text-accent";
    }

    if (session.state === "active:awaiting_input") {
      return "text-accent";
    }

    if (session.state === "terminated") {
      return "text-muted";
    }

    return "text-muted";
  }

  function formatSessionTitle(session: ChatSessionData): string {
    if (session.metadata?.title) {
      return session.metadata.title;
    }
    if (session.scriptPath) {
      const parts = session.scriptPath.split(/[/\\]/);
      return parts[parts.length - 1] ?? session.id;
    }
    return session.id;
  }
</script>

<div class="flex h-full w-screen flex-col">
  <header class="flex h-12 shrink-0 items-center justify-between px-4">
    <NavigationButtonsNew />
  </header>

  <div class="scrollbar-thin flex-1 overflow-y-auto">
    <div class="space-y-10 p-4 lg:p-6">
      <section>
        <div class="border-border flex items-center border-b text-sm">
          <button
            class={`px-4 py-2 font-medium ${
              selectedTab === "active"
                ? "border-accent text-foreground border-b-2"
                : "text-muted hover:text-foreground border-b-2 border-transparent"
            }`}
            onclick={() => selectTab("active")}
          >
            Active
            <span
              class="bg-accent/20 text-accent ml-1.5 rounded-full px-2 py-0.5 text-xs"
            >
              {tabCounts().active}
            </span>
          </button>
          <button
            class={`px-4 py-2 ${
              selectedTab === "queued"
                ? "border-accent text-foreground border-b-2"
                : "text-muted hover:text-foreground border-b-2 border-transparent"
            }`}
            onclick={() => selectTab("queued")}
          >
            Queued
            <span class="bg-surface ml-1.5 rounded-full px-2 py-0.5 text-xs">
              {tabCounts().queued}
            </span>
          </button>
          <button
            class={`px-4 py-2 ${
              selectedTab === "terminated"
                ? "border-accent text-foreground border-b-2"
                : "text-muted hover:text-foreground border-b-2 border-transparent"
            }`}
            onclick={() => selectTab("terminated")}
          >
            Terminated
            <span class="bg-surface ml-1.5 rounded-full px-2 py-0.5 text-xs">
              {tabCounts().terminated}
            </span>
          </button>
        </div>

        <div class="mt-4 space-y-1">
          {#if visibleSessions().length === 0}
            <div class="text-muted px-4 py-8 text-center text-sm">
              No chats to display
            </div>
          {:else}
            {#each visibleSessions() as session (session.id)}
              {@const Icon = getStatusIcon(session)}
              <div
                class="group hover:bg-surface flex items-center gap-3 rounded-lg p-2"
              >
                <Icon class={`text-base ${getStatusIconClass(session)}`} />
                <div class="min-w-0 flex-1">
                  <button
                    type="button"
                    class="text-foreground hover:text-accent block w-full truncate text-left font-medium"
                    title={formatSessionTitle(session)}
                    onclick={() => {
                      void handleEditPrompt(session);
                    }}
                  >
                    {formatSessionTitle(session)}
                  </button>
                  <div
                    class="text-muted mt-1.5 flex flex-wrap items-center gap-3 text-xs"
                  >
                    {#if getProjectName(session)}
                      <button
                        class="hover:text-foreground flex items-center gap-1.5"
                      >
                        <Folder class="text-xs" />
                        <span>{getProjectName(session)}</span>
                      </button>
                    {/if}
                    {#if getModelLabel(session)}
                      <div class="flex items-center gap-1.5">
                        <Cpu class="text-xs" />
                        <span>{getModelLabel(session)}</span>
                      </div>
                    {/if}
                    <div class="flex items-center gap-1.5">
                      <Clock class="text-xs" />
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                    </div>

                    <span
                      class="border-border rounded border px-2 py-0.5 font-medium"
                    >
                      {stateLabels[session.state] ?? session.state}
                    </span>

                    {#if session.state === "active:generating"}
                      <button
                        class="border-border bg-surface hover:text-accent flex items-center gap-1.5 rounded-md border px-2 py-1"
                        title="Stop"
                        onclick={() => handleTerminate(session)}
                      >
                        <StopFill class="text-xs" />
                        <span>Stop</span>
                      </button>
                    {/if}

                    {#if session.state === "active:awaiting_input"}
                      <button
                        class="border-border bg-surface hover:text-accent flex items-center gap-1.5 rounded-md border px-2 py-1"
                        title="Resume"
                        onclick={() => handleResume(session)}
                      >
                        <PlayFill class="text-xs" />
                        <span>Resume</span>
                      </button>
                    {/if}

                    {#if session.state === "active"}
                      <button
                        class="border-border bg-surface hover:text-accent flex items-center gap-1.5 rounded-md border px-2 py-1"
                        title="Terminate"
                        onclick={() => handleTerminate(session)}
                      >
                        <StopFill class="text-xs" />
                        <span>Terminate</span>
                      </button>
                    {/if}

                    {#if session.state !== "terminated"}
                      <button
                        class="border-border bg-surface hover:text-accent flex items-center gap-1.5 rounded-md border px-2 py-1"
                        title="Edit prompt"
                        onclick={() => handleEditPrompt(session)}
                      >
                        <Pencil class="text-xs" />
                        <span>Edit Prompt</span>
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <section>
        <h2 class="text-muted px-2 text-sm font-medium">Recent Prompts</h2>
        <div class="mt-2 space-y-1">
          {#if recentPrompts.length === 0}
            <div class="text-muted px-2 py-4 text-sm">
              {isLoadingRecentPromptEdits
                ? "Loading recent prompts..."
                : "No recent prompts found"}
            </div>
          {:else}
            {#each recentPrompts as entry (entry.id)}
              <button
                type="button"
                class="group hover:bg-surface flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors"
                onclick={() => void handlePromptEditSelect(entry)}
              >
                <span class="text-muted">
                  {#if entry.scriptPath}
                    <Terminal class="text-sm" />
                  {:else}
                    <Stars class="text-sm" />
                  {/if}
                </span>
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-foreground truncate font-medium"
                      title={entry.title}
                    >
                      {entry.title}
                    </span>
                    <span class="text-muted text-xs">
                      {formatRelativeTime(entry.updatedAt)}
                    </span>
                  </div>
                  {#if entry.preview}
                    <div class="text-muted truncate text-xs">
                      {entry.preview}
                    </div>
                  {/if}
                  <div class="text-muted truncate text-xs">
                    {entry.scriptPath
                      ? entry.relativePath ?? entry.scriptPath
                      : "Quick prompt draft"}
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #2c2c2e;
    border-radius: 3px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
