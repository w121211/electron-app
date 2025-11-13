<!-- src/renderer/src/components/app-v2/LightChatSessionView.svelte -->
<script lang="ts">
  import {
    Folder,
    Cpu,
    ThreeDotsVertical,
    Paperclip,
    MicFill,
    Send,
    Clipboard,
    Pencil,
  } from "svelte-bootstrap-icons";
  import type {
    ChatMessage,
    ChatSessionData,
  } from "../../../../core/services/chat/chat-session-repository.js";
  import { getModelMessageContentString } from "../../../../core/utils/message-utils.js";
  import { parseModelId } from "../../../../core/utils/model-utils-v2.js";
  import {
    isChatSession,
    type InboxEntry,
  } from "../../services/inbox-service.js";
  import { apiChatService } from "../../services/api-chat-service.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { updateInboxEntry } from "../../stores/inbox-store.svelte.js";
  import { toast } from "svelte-sonner";

  let {
    entry,
  }: {
    entry: InboxEntry | null;
  } = $props();

  const projects = $derived(projectState.projectFolders);
  const selectedChat = $derived.by<ChatSessionData | null>(() => {
    if (!entry || !isChatSession(entry)) {
      return null;
    }
    return entry;
  });

  let composerValue = $state("");
  let composerTextarea = $state<HTMLTextAreaElement | null>(null);
  let activeChatId = $state<string | null>(null);
  let isSending = $state(false);
  let isLaunchingSurface = $state(false);

  $effect(() => {
    const currentId = selectedChat?.id ?? null;
    if (currentId !== activeChatId) {
      activeChatId = currentId;
      composerValue = selectedChat?.metadata?.promptDraft ?? "";
      queueMicrotask(() => resizeComposer());
    }
  });

  $effect(() => {
    resizeComposer(composerValue);
  });

  $effect(() => {
    resizeComposer(composerTextarea);
  });

  function resizeComposer(trigger?: unknown): void {
    if (!composerTextarea) {
      return;
    }
    composerTextarea.style.height = "auto";
    const minHeight = 68;
    composerTextarea.style.height = `${Math.max(minHeight, composerTextarea.scrollHeight)}px`;
  }

  function resolveProjectName(chat: ChatSessionData | null): string {
    if (!chat?.metadata?.projectPath) {
      return "Select project";
    }
    const match = projects.find(
      (project) => project.path === chat.metadata?.projectPath,
    );
    return match?.name ?? chat.metadata.projectPath;
  }

  function resolveModelName(chat: ChatSessionData | null): string {
    const modelId = chat?.metadata?.modelId;
    if (!modelId) {
      return "Select model";
    }
    try {
      const parsed = parseModelId(modelId);
      return parsed.providerModelId;
    } catch {
      return modelId;
    }
  }

  type TextSegment = { type: "text" | "mention"; value: string };

  function toTextSegments(text: string): TextSegment[] {
    if (!text) {
      return [];
    }
    const pattern = /@[\w./-]+/g;
    const segments: TextSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: "text",
          value: text.slice(lastIndex, match.index),
        });
      }
      segments.push({ type: "mention", value: match[0] });
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }
    if (segments.length === 0) {
      segments.push({ type: "text", value: text });
    }
    return segments;
  }

  function getMessageText(message: ChatMessage): string {
    const raw = getModelMessageContentString(message.message);
    return raw.trim() ? raw : "";
  }

  function formatMessageTimestamp(value: Date | string | undefined): string {
    if (!value) {
      return "";
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getChatStatus(state: ChatSessionData["state"]): {
    label: string;
    tone: "accent" | "muted";
  } {
    switch (state) {
      case "active:generating":
        return { label: "Running", tone: "accent" };
      case "active:awaiting_input":
        return { label: "Awaiting", tone: "accent" };
      case "active:disconnected":
        return { label: "Disconnected", tone: "muted" };
      case "active":
        return { label: "Idle", tone: "muted" };
      case "queued":
        return { label: "Queued", tone: "accent" };
      case "terminated":
        return { label: "Terminated", tone: "muted" };
      default:
        return { label: state, tone: "muted" };
    }
  }

  async function handleCopyContent(text: string): Promise<void> {
    if (!text || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("Failed to copy message", error);
    }
  }

  function handleEditMessage(text: string): void {
    if (!text) {
      return;
    }
    composerValue = text;
    queueMicrotask(() => resizeComposer());
  }

  function handleComposerInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    composerValue = target.value;
  }

  function handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    const trimmed = composerValue.trim();
    if (!trimmed) {
      event.preventDefault();
      composerValue = "";
      queueMicrotask(() => resizeComposer());
      return;
    }
    event.preventDefault();
    void handleSendMessage();
  }

  async function handleSendMessage(): Promise<void> {
    if (!selectedChat || isSending) {
      return;
    }
    const trimmed = composerValue.trim();
    if (!trimmed) {
      composerValue = "";
      queueMicrotask(() => resizeComposer());
      return;
    }
    isSending = true;
    const result = await apiChatService
      .sendMessage({
        sessionId: selectedChat.id,
        prompt: trimmed,
      })
      .finally(() => {
        isSending = false;
      });
    composerValue = "";
    queueMicrotask(() => resizeComposer());
    updateInboxEntry(selectedChat.id, () => result.session);
  }

  async function handleOpenWebSurface(
    chat: ChatSessionData | null,
  ): Promise<void> {
    if (!chat || chat.modelSurface !== "web" || isLaunchingSurface) {
      return;
    }
    const modelId = chat.metadata?.modelId;
    if (!modelId) {
      toast.error("Session is missing model information.");
      return;
    }

    isLaunchingSurface = true;
    try {
      const result = await window.api.surface.launch({
        sessionId: chat.id,
        modelId,
        modelSurface: "web",
        projectPath: chat.metadata?.projectPath ?? undefined,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to open browser.");
      }
      toast.success("Browser ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to open browser.";
      toast.error(message);
    } finally {
      isLaunchingSurface = false;
    }
  }

  function getChatTitle(chat: ChatSessionData | null): string {
    if (!chat) {
      return "Select a chat";
    }
    return chat.metadata?.title || "Untitled Chat";
  }

  const chatStatus = $derived.by(() => {
    if (!selectedChat) {
      return null;
    }
    return getChatStatus(selectedChat.state);
  });
  const isWebChat = $derived.by(() => selectedChat?.modelSurface === "web");
  const webChatId = $derived.by(
    () => selectedChat?.metadata?.external?.webChatId ?? null,
  );

  const canSendMessage = $derived.by(() =>
    Boolean(
      selectedChat &&
        !isWebChat &&
        composerValue.trim() &&
        !isSending,
    ),
  );
</script>

{#if selectedChat}
  <section class="flex h-full flex-1 flex-col">
    <header
      class="flex h-11 shrink-0 items-center justify-between px-4 text-xs"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <Folder class="text-sm" />
          <span class="truncate">{resolveProjectName(selectedChat)}</span>
        </div>
        <div class="flex items-center gap-1">
          <Cpu class="text-sm" />
          <span>{resolveModelName(selectedChat)}</span>
        </div>
        <span class="text-muted truncate text-[10px] uppercase">
          {getChatTitle(selectedChat)}
        </span>
      </div>
      <div class="flex items-center gap-2">
        {#if chatStatus}
          <span
            class={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${chatStatus.tone === "accent" ? "border-border text-accent" : "border-border text-muted"}`}
          >
            {chatStatus.label}
          </span>
        {/if}
        <button
          type="button"
          class="hover:text-accent cursor-pointer rounded p-1.5"
          title="Session options"
        >
          <ThreeDotsVertical />
        </button>
      </div>
    </header>
    <div class="flex-1 overflow-y-auto px-6 py-4">
      {#if selectedChat.messages.length === 0}
        <div class="text-muted flex h-full items-center justify-center text-sm">
          No messages yet in this chat.
        </div>
      {:else}
        <div class="flex flex-col gap-6 text-sm">
          {#each selectedChat.messages as message (message.id)}
            {@const text = getMessageText(message)}
            {@const isUser = message.message.role === "user"}
            {@const isAssistant = message.message.role === "assistant"}
            <div class="group relative flex flex-col gap-2">
              {#if isUser}
                <div
                  class="bg-surface rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line"
                >
                  {#if text}
                    {#each toTextSegments(text) as segment, index (`${message.id}-segment-${index}`)}
                      {#if segment.type === "mention"}
                        <span class="text-accent">{segment.value}</span>
                      {:else}
                        {segment.value}
                      {/if}
                    {/each}
                  {:else}
                    <span class="text-muted">Empty message</span>
                  {/if}
                </div>
                <div
                  class="bg-background absolute right-0 bottom-0 hidden items-center gap-1 rounded-tl-lg p-1 group-hover:flex"
                >
                  <button
                    type="button"
                    class="hover:text-accent text-muted cursor-pointer p-1"
                    title="Edit message"
                    onclick={() => handleEditMessage(text)}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    class="hover:text-accent text-muted cursor-pointer p-1"
                    title="Copy message"
                    onclick={() => void handleCopyContent(text)}
                  >
                    <Clipboard />
                  </button>
                </div>
              {:else if isAssistant}
                <div class="leading-relaxed whitespace-pre-line">
                  {#if text}
                    {#each toTextSegments(text) as segment, index (`${message.id}-assistant-${index}`)}
                      {#if segment.type === "mention"}
                        <span class="text-accent">{segment.value}</span>
                      {:else}
                        {segment.value}
                      {/if}
                    {/each}
                  {:else}
                    <span class="text-muted">No response content.</span>
                  {/if}
                </div>
                <div
                  class="bg-background absolute right-0 bottom-0 hidden items-center gap-1 rounded-tl-lg p-1 group-hover:flex"
                >
                  <button
                    type="button"
                    class="hover:text-accent text-muted cursor-pointer p-1"
                    title="Copy message"
                    onclick={() => void handleCopyContent(text)}
                  >
                    <Clipboard />
                  </button>
                </div>
              {:else}
                <div
                  class="border-border text-muted rounded border px-3 py-2 text-xs uppercase"
                >
                  <span>{message.message.role}</span>
                  {#if text}
                    <span class="text-foreground normal-case">: {text}</span>
                  {/if}
                </div>
              {/if}
              <div
                class="text-muted flex items-center gap-2 text-[10px] uppercase"
              >
                <span>{message.message.role}</span>
                <span>·</span>
                <span
                  >{formatMessageTimestamp(message.metadata?.timestamp)}</span
                >
              </div>
              {#if message.metadata?.fileMentions?.length}
                <div class="text-muted flex flex-wrap gap-2 text-[11px]">
                  {#each message.metadata.fileMentions as file (file.path)}
                    <span class="bg-surface rounded-full px-2 py-0.5"
                      >@{file.path}</span
                    >
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
    {#if isWebChat}
      <div class="border-border text-muted bg-background/40 flex flex-col gap-2 border-t px-4 py-3 text-xs">
        <div class="text-foreground text-sm">
          This chat runs directly in the browser. Continue the conversation there—this view mirrors updates in real time.
        </div>
        <div class="flex flex-wrap gap-2 text-[11px]">
          <span>
            Assistant: <span class="text-foreground">{resolveModelName(selectedChat)}</span>
          </span>
          <span>·</span>
          <span>
            Status:
            <span class={chatStatus?.tone === "accent" ? "text-accent" : "text-foreground"}
              >{chatStatus?.label ?? "Unknown"}</span
            >
          </span>
          <span>·</span>
          <span>
            Chat ID:
            <span class="text-foreground">{webChatId ?? "Waiting for automator"}</span>
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-md border px-3 py-1.5 text-xs transition ${isLaunchingSurface ? "cursor-wait text-muted" : "hover:text-accent"}`}
            disabled={isLaunchingSurface}
            onclick={() => void handleOpenWebSurface(selectedChat)}
          >
            {isLaunchingSurface ? "Opening browser…" : "Open in Browser"}
          </button>
        </div>
      </div>
    {:else}
      <div class="border-border shrink-0 border-t">
        <div class="relative">
          <textarea
            placeholder="Type a message..."
            bind:this={composerTextarea}
            value={composerValue}
            rows="3"
            class="placeholder-muted w-full resize-none bg-transparent py-4 pr-24 pl-12 text-sm leading-relaxed outline-none"
            oninput={handleComposerInput}
            onkeydown={handleComposerKeydown}
          ></textarea>
          <div class="text-muted absolute top-4 left-4 flex items-center gap-2">
            <button
              type="button"
              title="Attach files"
              class="hover:text-accent cursor-pointer"
            >
              <Paperclip class="text-base" />
            </button>
          </div>
          <div class="text-muted absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              class="hover:text-accent cursor-pointer rounded p-1.5"
              title="Record audio"
            >
              <MicFill />
            </button>
            <button
              type="button"
              class={`flex items-center gap-1.5 rounded-md py-1.5 pr-3 pl-1.5 ${canSendMessage ? "hover:text-accent cursor-pointer" : "text-muted cursor-not-allowed opacity-60"}`}
              title="Send message"
              disabled={!canSendMessage}
              onclick={() => void handleSendMessage()}
            >
              <Send class="text-sm" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </section>
{:else}
  <div
    class="text-muted flex h-full flex-1 items-center justify-center text-sm"
  >
    Select a chat session to view messages.
  </div>
{/if}
