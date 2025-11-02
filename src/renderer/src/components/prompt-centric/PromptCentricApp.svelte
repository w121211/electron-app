<!-- src/renderer/src/components/prompt-centric/PromptCentricApp.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    Stars,
    PencilSquare,
    Search,
    Folder,
    Gear,
    Terminal,
    Globe,
    FileEarmarkText,
    PersonRaisedHand,
    MoonFill,
    Clock,
    Cpu,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import {
    promptCentricState,
    setPromptEntries,
    setPromptFilter,
    setPromptLoading,
    selectPrompt,
    getSelectedPrompt,
    type PromptListEntry,
    type PromptStatusFilter,
  } from "../../stores/prompt-centric-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { saveQuickPromptDraft } from "../../services/quick-prompt-service.js";
  import { fetchPromptEntries } from "../../services/prompt-centric-service.js";
  import PromptComposer from "./PromptComposer.svelte";

  const logger = new Logger({ name: "PromptCentricApp" });

  const filterOptions: Array<{ key: PromptStatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "terminated", label: "Terminated" },
    { key: "queued", label: "Queued" },
    { key: "draft", label: "Draft" },
    { key: "web", label: "Web" },
    { key: "cli", label: "CLI" },
  ];

  const entries = $derived(promptCentricState.entries);
  const filter = $derived(promptCentricState.filter);
  const isLoading = $derived(promptCentricState.isLoading);
  const selectedEditId = $derived(promptCentricState.selectedEditId);
  const selectedEntry = $derived.by(getSelectedPrompt);
  const projects = $derived(projectState.projectFolders);

  const filteredEntries = $derived.by(() =>
    applyFilter(entries, filter),
  );

  onMount(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await ensureProjectsLoaded();
        await ensureModelsLoaded();
        if (cancelled) {
          return;
        }
        await refreshEntries();
      } catch (error) {
        logger.error("Failed to bootstrap prompt-centric app", error);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  });

  async function ensureProjectsLoaded(): Promise<void> {
    if (projectState.projectFolders.length > 0) {
      return;
    }
    await projectService.loadProjectFolders();
  }

  async function ensureModelsLoaded(): Promise<void> {
    await modelClientService.hydrateAvailableModels();
  }

  async function refreshEntries(options?: {
    selectEditId?: string;
    selectSessionId?: string;
  }): Promise<void> {
    setPromptLoading(true);
    try {
      const results = await fetchPromptEntries();
      setPromptEntries(results);

      if (options?.selectEditId) {
        selectPrompt(options.selectEditId);
        return;
      }

      if (options?.selectSessionId) {
        const match = results.find(
          (entry) => entry.chatSession?.id === options.selectSessionId,
        );
        if (match) {
          selectPrompt(match.editId);
        }
      }
    } catch (error) {
      logger.error("Failed to load prompt entries", error);
    } finally {
      setPromptLoading(false);
    }
  }

  function applyFilter(
    input: PromptListEntry[],
    activeFilter: PromptStatusFilter,
  ): PromptListEntry[] {
    if (activeFilter === "all") {
      return input;
    }

    if (activeFilter === "draft") {
      return input.filter(
        (entry) => entry.kind === "draft" || !entry.chatSession,
      );
    }

    if (activeFilter === "queued") {
      return input.filter(
        (entry) => entry.chatSession?.state === "queued",
      );
    }

    if (activeFilter === "terminated") {
      return input.filter(
        (entry) => entry.chatSession?.state === "terminated",
      );
    }

    if (activeFilter === "web") {
      return input.filter((entry) => entry.modelSurface === "web");
    }

    if (activeFilter === "cli") {
      return input.filter(
        (entry) =>
          entry.modelSurface === "terminal" || entry.modelSurface === "pty",
      );
    }

    return input.filter((entry) => isEntryActive(entry));
  }

  function isEntryActive(entry: PromptListEntry): boolean {
    if (!entry.chatSession) {
      return false;
    }

    return (
      entry.chatSession.state === "active" ||
      entry.chatSession.state === "active:generating" ||
      entry.chatSession.state === "active:awaiting_input" ||
      entry.chatSession.state === "active:disconnected"
    );
  }

  function handleSelect(entry: PromptListEntry): void {
    if (entry.editId !== selectedEditId) {
      selectPrompt(entry.editId);
    }
  }

  async function handleCreateDraft(): Promise<void> {
    try {
      const saved = await saveQuickPromptDraft({ content: "" });
      await refreshEntries({ selectEditId: saved.editId });
    } catch (error) {
      logger.error("Failed to create draft prompt", error);
    }
  }

  function getEntryIcon(entry: PromptListEntry) {
    if (entry.kind === "draft" || !entry.modelSurface) {
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

  function getEntryStatus(entry: PromptListEntry): {
    label: string;
    variant: "accent" | "muted";
  } {
    if (!entry.chatSession) {
      return { label: "Draft", variant: "muted" };
    }

    switch (entry.chatSession.state) {
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
        return { label: entry.chatSession.state, variant: "muted" };
    }
  }

  function resolveSurfaceLabel(entry: PromptListEntry): string {
    if (!entry.chatSession) {
      return "Draft";
    }
    if (entry.modelSurface === "terminal" || entry.modelSurface === "pty") {
      return "CLI";
    }
    if (entry.modelSurface === "web") {
      return "WEB";
    }
    const surface = entry.modelSurface ?? entry.chatSession.modelSurface;
    return surface.toUpperCase();
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

  function resolveMetadataLine(entry: PromptListEntry): string {
    if (!entry.chatSession) {
      return "Draft";
    }

    const parts: string[] = [];
    const surface = resolveSurfaceLabel(entry);
    if (surface) {
      parts.push(surface);
    }

    const projectName = resolveProjectName(entry.projectPath);
    if (projectName) {
      parts.push(projectName);
    }

    if (entry.relativePath) {
      parts.push(entry.relativePath);
    }

    return parts.join(" · ");
  }

  function getFilterChipClasses(isActive: boolean): string {
    const base =
      "shrink-0 flex items-center rounded-xl bg-border px-2 py-1 text-xs uppercase transition-colors";
    if (isActive) {
      return `${base} text-accent`;
    }
    return `${base} text-muted hover:text-foreground`;
  }
</script>

<div class="bg-background text-foreground flex h-screen overflow-hidden font-sans">
  <nav class="w-10 flex flex-col items-center gap-3 py-2 pl-1">
    <div class="flex flex-1 flex-col items-center gap-3 text-base text-muted">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground"
        title="New Prompt"
        onclick={() => void handleCreateDraft()}
      >
        <PencilSquare />
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-border text-foreground"
        title="Prompts"
      >
        <Stars class="text-accent" />
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground"
        title="Search"
      >
        <Search />
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground"
        title="Projects"
      >
        <Folder />
      </button>
    </div>

    <button
      class="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-foreground"
      title="Settings"
    >
      <Gear />
    </button>
  </nav>

  <aside class="w-64 flex flex-col border-r border-border bg-background/40">
    <div class="px-3 py-3">
      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        {#each filterOptions as option (option.key)}
          <button
            class={getFilterChipClasses(option.key === filter)}
            onclick={() => setPromptFilter(option.key)}
          >
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto pr-2">
      {#if isLoading && filteredEntries.length === 0}
        <div class="text-muted px-3 py-6 text-sm">Loading prompts…</div>
      {:else if filteredEntries.length === 0}
        <div class="text-muted px-3 py-6 text-sm">No prompts yet.</div>
      {:else}
        <nav class="flex flex-col gap-1 pb-3">
          {#each filteredEntries as entry (entry.editId)}
            {@const Icon = getEntryIcon(entry)}
            {@const status = getEntryStatus(entry)}
            <button
              type="button"
              class={`group flex flex-col gap-1 rounded-lg p-2 text-left transition-colors ${
                entry.editId === selectedEditId ? "bg-border" : "hover:bg-border"
              }`}
              onclick={() => handleSelect(entry)}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <Icon class="text-muted text-base" />
                  <span
                    class="truncate pr-1 font-medium"
                    title={entry.title}
                  >
                    {entry.title}
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
              <div class="text-[11px] text-muted">
                {resolveMetadataLine(entry)}
              </div>
              <div class="flex items-center gap-2 text-[11px] text-muted">
                <Clock class="text-xs" />
                <span>{formatRelativeTime(entry.updatedAt)}</span>
                {#if entry.modelId}
                  <span class="flex items-center gap-1">
                    <Cpu class="text-xs" />
                    <span class="truncate">{entry.modelId}</span>
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </nav>
      {/if}
    </div>
  </aside>

  <main class="flex-1 flex flex-col bg-surface">
    <PromptComposer
      entry={selectedEntry}
      refreshEntries={refreshEntries}
    />
  </main>
</div>
