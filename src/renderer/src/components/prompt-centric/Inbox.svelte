<!-- src/renderer/src/components/prompt-centric/Inbox.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    Stars,
    Terminal,
    Globe,
    FileEarmarkText,
    PersonRaisedHand,
    MoonFill,
    Clock,
    Cpu,
    type SvgComponent,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import {
    inboxState,
    setInboxFilter,
    selectInboxEntry,
    getSelectedInboxEntry,
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
  import PromptComposerV2 from "./PromptComposerV2.svelte";
  import InboxContextMenu from "./InboxContextMenu.svelte";

  const logger = new Logger({ name: "Inbox" });

  const filterOptions: Array<{ key: InboxFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "terminated", label: "Terminated" },
    { key: "queued", label: "Queued" },
    { key: "prompt", label: "Prompt" },
    { key: "web", label: "Web" },
    { key: "cli", label: "CLI" },
  ];

  const entries = $derived(inboxState.entries);
  const filter = $derived(inboxState.filter);
  const isLoading = $derived(inboxState.isLoading);
  const selectedId = $derived(inboxState.selectedId);
  const selectedEntry = $derived.by(getSelectedInboxEntry);
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
    if (activeFilter === "all") {
      return input;
    }

    if (activeFilter === "prompt") {
      return input.filter((entry) => {
        if (isChatSession(entry)) {
          return false;
        }
        return true;
      });
    }

    if (activeFilter === "queued") {
      return input.filter((entry) => {
        if (!isChatSession(entry)) {
          return false;
        }
        return entry.state === "queued";
      });
    }

    if (activeFilter === "terminated") {
      return input.filter((entry) => {
        if (!isChatSession(entry)) {
          return false;
        }
        return entry.state === "terminated";
      });
    }

    if (activeFilter === "web") {
      return input.filter((entry) => {
        if (!isChatSession(entry)) {
          return false;
        }
        return entry.modelSurface === "web";
      });
    }

    if (activeFilter === "cli") {
      return input.filter((entry) => {
        if (!isChatSession(entry)) {
          return false;
        }
        return (
          entry.modelSurface === "terminal" || entry.modelSurface === "pty"
        );
      });
    }

    return input.filter((entry) => isEntryActive(entry));
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
      return Stars;
    }
    if (entry.modelSurface === "terminal" || entry.modelSurface === "pty") {
      return Terminal;
    }
    if (entry.modelSurface === "web") {
      return Globe;
    }
    return FileEarmarkText;
  }

  function getEntryStatus(entry: InboxEntry): {
    label: string;
    variant: "accent" | "muted";
  } {
    if (isPrompt(entry)) {
      return { label: "Draft", variant: "muted" };
    }

    switch (entry.state) {
      case "active:generating":
        return { label: "Running", variant: "accent" };
      case "active:awaiting_input":
        return { label: "Awaiting", variant: "accent" };
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

  function resolveSurfaceLabel(entry: InboxEntry): string {
    if (isPrompt(entry)) {
      return "Draft";
    }
    if (entry.modelSurface === "terminal" || entry.modelSurface === "pty") {
      return "CLI";
    }
    if (entry.modelSurface === "web") {
      return "WEB";
    }
    return entry.modelSurface.toUpperCase();
  }

  function resolveProjectName(projectPath: string | null): string | null {
    if (!projectPath) {
      return null;
    }

    const project = projects.find((item) => item.path === projectPath);
    return project?.name ?? null;
  }

  function formatRelativeTime(timestamp: Date): string {
    const target = timestamp.getTime();
    if (Number.isNaN(target)) {
      return "";
    }

    const diffMs = Date.now() - target;
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

  function resolveMetadataLine(entry: InboxEntry): string {
    if (isPrompt(entry)) {
      return "Prompt";
    }

    const parts: string[] = [];
    const surface = resolveSurfaceLabel(entry);
    if (surface) {
      parts.push(surface);
    }

    const projectPath = entry.metadata?.projectPath ?? null;
    const projectName = resolveProjectName(projectPath);
    if (projectName) {
      parts.push(projectName);
    }

    return parts.join(" · ");
  }

  function handleJumpToSourcePrompt(sourcePromptId: string): void {
    selectInboxEntry(sourcePromptId);
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

<div class="bg-background flex h-screen overflow-hidden">
  <aside class="border-border flex w-64 flex-col border-r">
    <div class="px-3 py-3">
      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        {#each filterOptions as option (option.key)}
          <button
            class="bg-border flex shrink-0 items-center rounded-xl px-2 py-1 text-xs uppercase transition-colors {option.key ===
            filter
              ? 'text-accent'
              : 'text-muted hover:text-foreground'}"
            onclick={() => setInboxFilter(option.key)}
          >
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto pr-2">
      {#if isLoading && filteredEntries.length === 0}
        <div class="text-muted px-3 py-6 text-sm">Loading entries…</div>
      {:else if filteredEntries.length === 0}
        <div class="text-muted px-3 py-6 text-sm">No entries yet.</div>
      {:else}
        <nav class="flex flex-col gap-1 pb-3">
          {#each filteredEntries as entry (getEntryId(entry))}
            {@const Icon = getEntryIcon(entry)}
            {@const status = getEntryStatus(entry)}
            {@const entryId = getEntryId(entry)}
            {@const title = getDynamicTitle(entry)}
            <button
              type="button"
              class={`group flex flex-col gap-1 rounded-lg p-2 text-left transition-colors ${
                entryId === selectedId ? "bg-border" : "hover:bg-border"
              }`}
              onclick={() => handleSelect(entry)}
              oncontextmenu={(e) => handleContextMenu(e, entry)}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Icon class="text-muted text-base" />
                  <span class="truncate pr-1 font-medium" {title}>
                    {title}
                  </span>
                </div>
                <span
                  class={`flex items-center gap-1 text-[10px] uppercase ${
                    status.variant === "accent" ? "text-accent" : "text-muted"
                  }`}
                >
                  {#if status.label === "Awaiting"}
                    <PersonRaisedHand class="text-xs" />
                  {:else if status.label === "Running"}
                    <Stars class="text-xs" />
                  {:else if status.label === "Idle"}
                    <MoonFill class="text-xs" />
                  {/if}
                  <span>{status.label}</span>
                </span>
              </div>
              <div class="text-muted text-[11px]">
                {resolveMetadataLine(entry)}
              </div>
              <div class="text-muted flex items-center gap-2 text-[11px]">
                <Clock class="text-xs" />
                <span>{formatRelativeTime(entry.updatedAt)}</span>
                {#if isChatSession(entry)}
                  {#if entry.metadata?.modelId}
                    <span class="flex items-center gap-1">
                      <Cpu class="text-xs" />
                      <span class="truncate">{entry.metadata.modelId}</span>
                    </span>
                  {/if}
                  {#if entry.sourcePromptId}
                    <span
                      class="text-accent cursor-pointer hover:underline"
                      role="button"
                      tabindex="0"
                      onclick={(e) => {
                        e.stopPropagation();
                        handleJumpToSourcePrompt(entry.sourcePromptId!);
                      }}
                      onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleJumpToSourcePrompt(entry.sourcePromptId!);
                        }
                      }}
                    >
                      View Source
                    </span>
                  {/if}
                {/if}
              </div>
            </button>
          {/each}
        </nav>
      {/if}
    </div>
  </aside>

  <main class="bg-surface flex flex-1 flex-col">
    <PromptComposerV2 entry={selectedEntry} />
  </main>

  <InboxContextMenu />
</div>
