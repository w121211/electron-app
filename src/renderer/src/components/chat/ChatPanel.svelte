<!-- src/renderer/src/components/ChatPanel.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import {
    Share,
    Download,
    Pencil,
    PencilSquare,
    Paperclip,
    House,
    Search,
    LayoutSidebar,
  } from "svelte-bootstrap-icons";
  import { isTerminalModel } from "../../../../core/utils/model-utils.js";
  import { chatService } from "../../services/chat-service.js";
  import { ptyChatService } from "../../services/pty-chat-service.js";
  import { fileSearchService } from "../../services/file-search-service.js";
  import {
    chatState,
    updateMessageInput,
    savePromptCursorPosition,
    clearPromptCursorPosition,
  } from "../../stores/chat-store.svelte.js";
  import {
    uiState,
    showToast,
    toggleLeftPanel,
  } from "../../stores/ui-store.svelte.js";
  import { fileSearchState } from "../../stores/file-search-store.svelte.js";
  import { setPreference } from "../../stores/local-preferences-store.svelte.js";
  import AiGenerationDisplay from "./AiGenerationDisplay.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import ToolCallConfirmation from "./ToolCallConfirmation.svelte";
  import FileSearchDropdown from "./FileSearchDropdown.svelte";
  import PromptEditor from "./PromptEditor.svelte";
  import ModelSelectorDropdown from "./ModelSelectorDropdown.svelte";
  import Breadcrumb from "../Breadcrumb.svelte";

  // Derived loading states
  const isLoadingSubmitMessage = $derived(
    uiState.loadingStates["submitMessage"] || false,
  );
  const isStartingPtySession = $derived(
    uiState.loadingStates["startPtySession"] || false,
  );

  // Derived chat states
  const hasCurrentChat = $derived(chatState.currentChat !== null);
  const currentChatMessages = $derived(chatState.currentChat?.messages || []);
  const isTerminalModelSelected = $derived(
    isTerminalModel(chatState.selectedModel),
  );
  const canStartPtySession = $derived(
    isTerminalModelSelected && chatState.messageInput.trim().length > 0,
  );

  let messageInputElement = $state<HTMLTextAreaElement>();
  let messagesContainer = $state<HTMLDivElement>();
  let draftTimeout: ReturnType<typeof setTimeout>;

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
    if (chatState.currentChat && chatState.currentChat.messages.length > 0) {
      // Chat has messages, set selectedModel to the chat's current modelId
      chatState.selectedModel = chatState.currentChat.modelId;
    }
  });

  // Save chat preferences to localStorage when they change
  $effect(() => {
    setPreference("chatMode", chatState.chatMode);
    setPreference("selectedModel", chatState.selectedModel);
  });

  // Smart prompt editor logic - suggest editor for empty chats
  const shouldShowPromptEditorByDefault = $derived.by(() => {
    if (!chatState.currentChat) {
      return false;
    }
    return currentChatMessages.length === 0; // Empty chat = suggest editor
  });

  // Auto-reset prompt editor to smart default when switching chats
  let previousChatIdForPromptEditor: string | null = null;
  $effect(() => {
    const currentChatId = chatState.currentChat?.id || null;

    // When switching to a different chat, reset to smart default
    if (currentChatId !== previousChatIdForPromptEditor) {
      uiState.promptEditorOpen = shouldShowPromptEditorByDefault;
    }

    previousChatIdForPromptEditor = currentChatId;
  });

  async function handleSendMessage(): Promise<void> {
    if (isTerminalModelSelected) {
      ptyChatService.startPtySessionFromDraft(chatState.messageInput);
      return;
    }

    if (!chatState.messageInput.trim() || !chatState.currentChat) return;

    const message = chatState.messageInput.trim();
    const chatId = chatState.currentChat.id;

    // Only pass modelId for the first message (when no messages exist)
    const modelId =
      chatState.currentChat.messages.length === 0
        ? chatState.selectedModel
        : undefined;

    await chatService.sendMesage(
      chatState.currentChat.absoluteFilePath,
      chatId,
      message,
      modelId,
      undefined, // attachments
    );
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

    // Save draft when user actively types (including clearing content)
    if (chatState.currentChat) {
      clearTimeout(draftTimeout);
      draftTimeout = setTimeout(() => {
        chatService.savePromptDraft(
          chatState.currentChat!.absoluteFilePath,
          value,
        );
      }, 1500);
    }
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

  // Auto-resize textarea when messageInput changes (e.g., from prompt editor)
  let previousPromptEditorOpen = uiState.promptEditorOpen;
  $effect(() => {
    // If prompt editor is opening, save current cursor position
    if (
      !previousPromptEditorOpen &&
      uiState.promptEditorOpen &&
      messageInputElement
    ) {
      savePromptCursorPosition(
        messageInputElement.selectionStart,
        messageInputElement.selectionEnd,
      );
    }

    // If prompt editor was just closed, focus the textarea and restore cursor position
    if (
      previousPromptEditorOpen &&
      !uiState.promptEditorOpen &&
      messageInputElement
    ) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.focus();
          // Restore cursor position if we have one saved
          if (chatState.promptCursorPosition) {
            messageInputElement.setSelectionRange(
              chatState.promptCursorPosition.start,
              chatState.promptCursorPosition.end,
            );
            clearPromptCursorPosition(); // Clear after use
          }
        }
      });
    }

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

    previousPromptEditorOpen = uiState.promptEditorOpen;
  });

  // Cleanup timeouts on component destroy using $effect
  $effect(() => {
    return () => {
      clearTimeout(draftTimeout);
      fileSearchService.cleanup();
    };
  });
</script>

<section
  class="relative flex min-w-0 flex-1 flex-col"
  class:bg-surface={uiState.promptEditorOpen}
>
  {#if hasCurrentChat}
    <!-- Breadcrumb Header -->
    <header class="flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-1">
        <!-- Show navigation buttons when left panel is closed -->
        {#if !uiState.leftPanelOpen}
          <button
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Home"
          >
            <House class="text-base" />
          </button>
          <button
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Search"
          >
            <Search class="text-base" />
          </button>
          <button
            onclick={toggleLeftPanel}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Toggle Sidebar"
          >
            <LayoutSidebar class="text-base" />
          </button>
        {/if}

        {#if chatState.currentChat}
          <div class={!uiState.leftPanelOpen ? "ml-3" : ""}>
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
        <!-- {#if isTerminalModelSelected}
          <button
            onclick={() =>
              ptyChatService.startPtySessionFromDraft(chatState.messageInput)}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5 disabled:opacity-50"
            title="Run in PTY"
            disabled={!canStartPtySession || isStartingPtySession}
          >
            Run in PTY
          </button>
        {/if} -->
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

    <!-- Prompt Editor / Messages -->
    {#if uiState.promptEditorOpen}
      <PromptEditor />
    {:else}
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
            {#if !uiState.promptEditorOpen && fileSearchState.showMenu}
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
                onclick={chatService.togglePromptEditor}
                title="Prompt Editor"
                class="text-muted hover:text-accent cursor-pointer"
              >
                <PencilSquare />
              </button>
            </div>
          </div>
        </div>
      </footer>
    {/if}
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

<!-- <style>
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
</style> -->
