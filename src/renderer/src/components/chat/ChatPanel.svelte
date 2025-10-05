<!-- src/renderer/src/components/ChatPanel.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import {
    Share,
    Download,
    Pencil,
    PencilSquare,
    Paperclip,
  } from "svelte-bootstrap-icons";
  import { isTerminalModel } from "../../../../core/utils/model-utils.js";
  import { chatService } from "../../services/chat-service.js";
  import { fileSearchService } from "../../services/file-search-service.js";
  import {
    chatState,
    updateMessageInput,
  } from "../../stores/chat-store.svelte.js";
  import { ui } from "../../stores/ui.svelte.ts";
  import { showToast } from "../../stores/ui-store.svelte.js";
  import { fileSearchState } from "../../stores/file-search-store.svelte.js";
  import { setPreference } from "../../lib/local-storage.js";
  import AiGenerationDisplay from "./AiGenerationDisplay.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import ToolCallConfirmation from "./ToolCallConfirmation.svelte";
  import FileSearchDropdown from "../document/FileSearchDropdown.svelte";
  import ModelSelectorDropdown from "../document/ModelSelectorDropdown.svelte";
  import Breadcrumb from "../Breadcrumb.svelte";
  import NavigationButtons from "../NavigationButtons.svelte";

  // Derived loading states
  const isLoadingSubmitMessage = $derived(
    chatState.currentChat?.sessionStatus === "processing",
  );

  // Derived chat states
  const hasCurrentChat = $derived(chatState.currentChat !== null);
  const currentChatMessages = $derived(chatState.currentChat?.messages || []);

  let messageInputElement = $state<HTMLTextAreaElement>();
  let messagesContainer = $state<HTMLDivElement>();

  // Auto-scroll to bottom when new messages arrive using $effect
  $effect(() => {
    if (currentChatMessages && messagesContainer) {
      tick().then(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  });

  // Auto-focus input when a new chat is opened using $effect
  let previousChatId: string | null = null;
  $effect(() => {
    const currentChatId = chatState.currentChat?.id || null;

    // Only focus if we're switching to a different chat (including from no chat to a chat)
    if (
      currentChatId &&
      currentChatId !== previousChatId &&
      messageInputElement
    ) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.focus();
        }
      });
    }

    previousChatId = currentChatId;
  });

  // Sync selected model with current chat's modelId
  $effect(() => {
    if (
      chatState.currentChat &&
      chatState.currentChat.messages.length > 0 &&
      chatState.currentChat.modelId
    ) {
      // Chat has messages, set selectedModel to the chat's current modelId
      chatState.selectedModel = chatState.currentChat.modelId;
    }
  });

  // Save chat preferences to localStorage when they change
  $effect(() => {
    setPreference("chatMode", chatState.chatMode);
    setPreference("selectedModel", chatState.selectedModel);
  });

  async function handleSendMessage(): Promise<void> {
    if (isTerminalModel(chatState.selectedModel)) {
      throw new Error("Terminal models handled in PtyChatPanel");
    }

    if (!chatState.messageInput.trim() || !chatState.currentChat) return;

    await chatService.sendPrompt({
      sessionId: chatState.currentChat.id,
      prompt: chatState.messageInput.trim(),
    });
  }

  function handleInputChange(value: string): void {
    updateMessageInput(value);

    // Auto-resize textarea
    if (messageInputElement) {
      messageInputElement.style.height = "auto";
      messageInputElement.style.height =
        Math.min(messageInputElement.scrollHeight, 200) + "px";
    }

    // Handle @ file reference detection
    fileSearchService.detectFileReference(value, messageInputElement ?? null);
  }

  // Handle search menu cancel
  function handleSearchCancel(): void {
    fileSearchService.handleSearchCancel(messageInputElement ?? null);
  }

  // Handle search menu hover (for keyboard navigation)
  function handleSearchHover(index: number): void {
    fileSearchService.handleSearchHover(index);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    // Handle search menu navigation
    const handled = fileSearchService.handleSearchKeydown(
      event,
      messageInputElement ?? null,
      chatState.messageInput,
    );

    if (handled) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  function handleShare(): void {
    showToast("Share functionality coming soon", "info");
  }

  function handleDownload(): void {
    showToast("Download functionality coming soon", "info");
  }

  function handleEdit(): void {
    showToast("Edit functionality coming soon", "info");
  }

  const selectedModelLabel = $derived(() => {
    if (!chatState.selectedModel) return "";
    return chatState.selectedModel;
  });

  $effect(() => {
    // Auto-resize when messageInput changes
    if (messageInputElement && chatState.messageInput) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.style.height = "auto";
          messageInputElement.style.height =
            Math.min(messageInputElement.scrollHeight, 200) + "px";
        }
      });
    }
  });
</script>

<section class="relative flex min-w-0 flex-1 flex-col">
  {#if hasCurrentChat}
    <!-- Breadcrumb Header -->
    <header class="flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-1">
        <NavigationButtons />

        {#if chatState.currentChat}
          <div class={!ui.leftPanelOpen ? "ml-3" : ""}>
            <Breadcrumb
              filePath={chatState.currentChat.absoluteFilePath}
              modelInfo={currentChatMessages.length > 0
                ? selectedModelLabel()
                : undefined}
              hasUnsavedChanges={chatState.hasUnsavedDraftChanges}
            />
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={handleShare}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Share"
        >
          <Share class="text-base" />
        </button>
        <button
          onclick={handleDownload}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Export"
        >
          <Download class="text-base" />
        </button>
        <button
          onclick={handleEdit}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Edit"
        >
          <Pencil class="text-base" />
        </button>
      </div>
    </header>

    <!-- Messages -->
    <div
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto px-8 py-6"
    >
      <div class="mx-auto max-w-3xl space-y-12">
        {#each currentChatMessages as chatMessage (chatMessage.id)}
          <ChatMessage {chatMessage} />
        {/each}

        <!-- AI Generation Display -->
        {#if chatState.currentChat?.sessionStatus === "processing"}
          <AiGenerationDisplay chatSession={chatState.currentChat} />
        {/if}

        <!-- Tool Call Confirmation Block -->
        {#if chatState.currentChat?.sessionStatus === "waiting_confirmation"}
          {@const lastMessage =
            currentChatMessages[currentChatMessages.length - 1]?.message}
          <ToolCallConfirmation
            chatId={chatState.currentChat.id}
            absoluteFilePath={chatState.currentChat.absoluteFilePath}
            lastAssistantMessage={lastMessage}
          />
        {/if}
      </div>
    </div>

    <!-- Input Area -->
    <footer class="bg-background px-6 py-4">
      <div class="mx-auto max-w-3xl">
        <div
          class="bg-surface border-border relative flex items-center gap-2 rounded-2xl border p-2"
        >
          <textarea
            bind:this={messageInputElement}
            bind:value={chatState.messageInput}
            oninput={(e) => handleInputChange(e.currentTarget.value)}
            onkeypress={handleKeyPress}
            onkeydown={handleKeyPress}
            placeholder="How can I help?"
            class="text-foreground placeholder-muted min-h-[72px] w-full resize-none border-none bg-transparent px-2 text-[15px] leading-6 outline-none"
            style="height: auto;"
            disabled={isLoadingSubmitMessage ||
              chatState.currentChat?.sessionStatus !== "idle"}
          ></textarea>

          <!-- File Search Dropdown -->
          {#if fileSearchState.showMenu}
            <FileSearchDropdown
              results={fileSearchState.results}
              selectedIndex={fileSearchState.selectedIndex}
              onselect={(file) => {
                fileSearchService.handleFileSelect(
                  file,
                  messageInputElement ?? null,
                  chatState.messageInput,
                );
              }}
              oncancel={handleSearchCancel}
              onhover={handleSearchHover}
              class="absolute top-full right-0 left-0 mt-1"
            />
          {/if}
        </div>

        <!-- Controls under input -->
        <div class="mt-2 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <button
              title="Attach"
              class="text-muted hover:text-accent cursor-pointer"
            >
              <Paperclip />
            </button>
            <!-- Model selector dropdown -->
            <ModelSelectorDropdown position="above" />
          </div>
          <div class="flex items-center">
            <button
              onclick={() => (ui.promptEditorOpen = !ui.promptEditorOpen)}
              title="Prompt Editor"
              class="text-muted hover:text-accent cursor-pointer"
            >
              <PencilSquare />
            </button>
          </div>
        </div>
      </div>
    </footer>
  {:else}
    <!-- No Chat Selected -->
    <div class="bg-background flex flex-1 items-center justify-center">
      <div class="text-muted text-center">
        <div class="mx-auto mb-4 text-5xl">💬</div>
        <p class="mb-2">Select a chat file to start</p>
        <p class="text-xs opacity-75">
          Create a new chat from the file explorer
        </p>
      </div>
    </div>
  {/if}
</section>
