<!-- src/renderer/src/components/prompt-centric/LightEntryList.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    Terminal,
    Globe,
    FileEarmarkText,
    PersonRaisedHand,
    type SvgComponent,
  } from "svelte-bootstrap-icons";
  import { SvelteDate } from "svelte/reactivity";
  import { Logger } from "tslog";
  import {
    inboxState,
    setInboxFilter,
    selectInboxEntry,
    showInboxContextMenu,
    refreshInboxEntries,
    type InboxFilter,
  } from "../../stores/inbox-store.svelte.js";
  import {
    isChatSession,
    isPrompt,
    getEntryId,
    getEntryTitle,
    type InboxEntry,
  } from "../../services/inbox-service.js";
  import { projectState } from "../../stores/project-store.svelte.js";

  const logger = new Logger({ name: "LightEntryList" });

  const filterOptions: Array<{ key: InboxFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "prompts", label: "Prompts" },
  ];

  const entries = $derived(inboxState.entries);
  const filter = $derived(inboxState.filter);
  const isLoading = $derived(inboxState.isLoading);
  const selectedId = $derived(inboxState.selectedId);
  const projects = $derived(projectState.projectFolders);
  const filteredEntries = $derived.by(() => applyFilter(entries, filter));

  onMount(() => {
    let cancelled = false;

    const loadEntries = async (): Promise<void> => {
      try {
        if (cancelled) {
          return;
        }
        await refreshInboxEntries();
      } catch (error) {
        logger.error("Failed to load inbox entries", error);
      }
    };

    void loadEntries();

    return () => {
      cancelled = true;
    };
  });

  function applyFilter(
    input: InboxEntry[],
    activeFilter: InboxFilter,
  ): InboxEntry[] {
    switch (activeFilter) {
      case "all":
        return input;
      case "prompts":
        return input.filter(isPrompt);
      // case "chats":
      //   return input.filter(isChatSession);
      case "active":
        return input.filter((entry) => isEntryActive(entry));
      default:
        return input;
    }
  }

  function isEntryActive(entry: InboxEntry): boolean {
    if (!isChatSession(entry)) {
      return false;
    }

    return (
      entry.state === "active" ||
      entry.state === "active:generating" ||
      entry.state === "active:awaiting_input" ||
      entry.state === "active:disconnected"
    );
  }

  function handleSelect(entry: InboxEntry): void {
    const entryId = getEntryId(entry);
    if (entryId !== selectedId) {
      selectInboxEntry(entryId);
    }
  }

  function getEntryIcon(entry: InboxEntry): typeof SvgComponent {
    if (isPrompt(entry)) {
      return FileEarmarkText;
    }
    if (entry.modelSurface === "terminal" || entry.modelSurface === "pty") {
      return Terminal;
    }
    if (entry.modelSurface === "web") {
      return Globe; // Replacement for bi-openai
    }
    return FileEarmarkText;
  }

  function getEntryStatus(entry: InboxEntry): {
    label: string;
    variant: "accent" | "muted";
    icon?: typeof SvgComponent;
  } {
    if (isPrompt(entry)) {
      return { label: "Draft", variant: "muted" };
    }

    switch (entry.state) {
      case "active:generating":
        return { label: "Running", variant: "accent" };
      case "active:awaiting_input":
        return { label: "Awaiting", variant: "accent", icon: PersonRaisedHand };
      case "active:disconnected":
        return { label: "Disconnected", variant: "muted" };
      case "active":
        return { label: "Idle", variant: "muted" };
      case "queued":
        return { label: "Queued", variant: "accent" };
      case "terminated":
        return { label: "Terminated", variant: "muted" };
      default:
        return { label: entry.state, variant: "muted" };
    }
  }

  function resolveProjectName(projectPath: string | null): string | null {
    if (!projectPath) {
      return null;
    }

    const project = projects.find((item) => item.path === projectPath);
    return project?.name ?? null;
  }

  function formatTimestamp(timestamp: Date): string {
    const target = new Date(timestamp);
    if (Number.isNaN(target.getTime())) {
      return "";
    }

    const today = new Date();
    if (target.toDateString() === today.toDateString()) {
      return "Today";
    }

    const yesterday = new SvelteDate(today);
    yesterday.setDate(today.getDate() - 1);
    if (target.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return target.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function getSecondaryLine(entry: InboxEntry): string {
    if (isPrompt(entry)) {
      const projectName = resolveProjectName(
        entry.metadata?.projectPath ?? null,
      );
      return ["Prompt", projectName].filter(Boolean).join(" · ");
    }

    if (isChatSession(entry)) {
      // Try to get a message preview
      const lastUserMessage = entry.messages.findLast(
        (msg) => msg.message.role === "user",
      );
      if (
        lastUserMessage &&
        typeof lastUserMessage.message.content === "string" &&
        lastUserMessage.message.content.trim().length > 0
      ) {
        return lastUserMessage.message.content.trim().split("\n")[0]; // First line of user message
      }

      // Fallback to model and project name
      const modelId =
        entry.metadata?.modelId?.split("/")[1] ?? entry.metadata?.modelId;
      const projectName = resolveProjectName(
        entry.metadata?.projectPath ?? null,
      );
      return [modelId, projectName].filter(Boolean).join(" · ");
    }

    return "";
  }

  function handleContextMenu(event: MouseEvent, entry: InboxEntry): void {
    event.preventDefault();
    const entryId = getEntryId(entry);
    showInboxContextMenu(
      event.clientX,
      event.clientY,
      entryId,
      isPrompt(entry),
    );
  }

  function getDynamicTitle(entry: InboxEntry): string {
    if (!isPrompt(entry)) {
      return getEntryTitle(entry);
    }

    const content = entry.content.trim();
    if (!content) {
      return "Untitled Prompt";
    }

    const firstLine = content.split("\n")[0];
    return firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
  }
</script>

<aside class="border-border flex w-64 flex-col border-r">
  <div class="px-3 py-3">
    <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
      {#each filterOptions as option (option.key)}
        <button
          class="bg-surface text-muted hover:text-foreground flex items-center rounded-xl px-2 py-1 text-xs uppercase transition-colors {option.key ===
          filter
            ? 'text-accent'
            : ''} shrink-0"
          onclick={() => setInboxFilter(option.key)}
        >
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  </div>
  <div class="flex-1 overflow-y-auto px-2">
    {#if isLoading && filteredEntries.length === 0}
      <div class="text-muted px-3 py-6 text-sm">Loading entries…</div>
    {:else if filteredEntries.length === 0}
      <div class="text-muted px-3 py-6 text-sm">No entries yet.</div>
    {:else}
      <nav class="flex flex-col gap-0.5 text-xs">
        {#each filteredEntries as entry (getEntryId(entry))}
          {@const entryId = getEntryId(entry)}
          {@const Icon = getEntryIcon(entry)}
          {@const status = getEntryStatus(entry)}
          {@const title = getDynamicTitle(entry)}
          <button
            type="button"
            class="group hover:bg-surface flex flex-col gap-1 rounded-lg p-2 text-left transition-colors"
            class:bg-surface={entryId === selectedId}
            onclick={() => handleSelect(entry)}
            oncontextmenu={(e) => handleContextMenu(e, entry)}
          >
            <div class="flex items-start justify-between">
              <div class="flex min-w-0 items-center gap-2">
                <Icon class="text-muted shrink-0" />
                <span class="text-foreground truncate pr-1 font-medium"
                  >{title}</span
                >
              </div>
              <span
                class="text-muted flex items-center gap-1 text-[10px] uppercase"
              >
                {#if isPrompt(entry)}
                  <span>{status.label}</span> <!-- This will be "Draft" -->
                {:else if isChatSession(entry)}
                  <span>{formatTimestamp(entry.updatedAt)}</span>
                {/if}
              </span>
            </div>
            <div class="flex items-start justify-between">
              <div class="text-muted truncate text-[11px]">
                {getSecondaryLine(entry)}
              </div>
              {#if isChatSession(entry) && status.label !== "Terminated"}
                <span
                  class={`flex items-center gap-1 text-[10px] uppercase ${status.variant === "accent" ? "text-accent" : "text-muted"}`}
                >
                  {#if status.icon}
                    {@const StatusIcon = status.icon}
                    <StatusIcon />
                  {/if}
                  <span>{status.label}</span>
                </span>
              {/if}
            </div>
          </button>
        {/each}
      </nav>
    {/if}
  </div>
</aside>
